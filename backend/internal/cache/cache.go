// Пакет cache инкапсулирует работу с Redis: сессии, кэш справочников,
// распределённые блокировки и счётчики неудачных попыток входа.
package cache

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	SessionTTL   = 12 * time.Hour
	LoginFailTTL = 15 * time.Minute
	MaxLoginFail = 5
)

// Session — данные сессии пользователя.
type Session struct {
	UserID   int    `json:"user_id"`
	Login    string `json:"login"`
	Role     string `json:"role"`
	DriverID *int   `json:"driver_id,omitempty"`
	ClientID *int   `json:"client_id,omitempty"`
}

type Cache struct {
	rdb *redis.Client
}

func New(ctx context.Context, addr string) (*Cache, error) {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	var err error
	for attempt := 0; attempt < 30; attempt++ {
		if err = rdb.Ping(ctx).Err(); err == nil {
			return &Cache{rdb: rdb}, nil
		}
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("Redis недоступен: %w", err)
}

func (c *Cache) Client() *redis.Client { return c.rdb }

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// CreateSession сохраняет сессию и возвращает её токен.
func (c *Cache) CreateSession(ctx context.Context, s Session) (string, error) {
	token := randomToken(32)
	data, _ := json.Marshal(s)
	pipe := c.rdb.TxPipeline()
	pipe.Set(ctx, "sess:"+token, data, SessionTTL)
	key := fmt.Sprintf("user_sess:%d", s.UserID)
	pipe.SAdd(ctx, key, token)
	pipe.Expire(ctx, key, SessionTTL)
	_, err := pipe.Exec(ctx)
	return token, err
}

// GetSession возвращает сессию и продлевает срок её действия.
func (c *Cache) GetSession(ctx context.Context, token string) (*Session, error) {
	data, err := c.rdb.Get(ctx, "sess:"+token).Bytes()
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	c.rdb.Expire(ctx, "sess:"+token, SessionTTL)
	return &s, nil
}

func (c *Cache) DeleteSession(ctx context.Context, token string) {
	c.rdb.Del(ctx, "sess:"+token)
}

// DropUserSessions завершает все сессии пользователя
// (при блокировке, смене роли или пароля).
func (c *Cache) DropUserSessions(ctx context.Context, userID int) {
	key := fmt.Sprintf("user_sess:%d", userID)
	tokens, _ := c.rdb.SMembers(ctx, key).Result()
	for _, t := range tokens {
		c.rdb.Del(ctx, "sess:"+t)
	}
	c.rdb.Del(ctx, key)
}

// LoginBlocked сообщает, превышен ли лимит неудачных попыток входа.
func (c *Cache) LoginBlocked(ctx context.Context, key string) bool {
	n, err := c.rdb.Get(ctx, "login_fail:"+key).Int()
	return err == nil && n >= MaxLoginFail
}

// LoginFailed увеличивает счётчик неудачных попыток.
func (c *Cache) LoginFailed(ctx context.Context, key string) {
	k := "login_fail:" + key
	n, _ := c.rdb.Incr(ctx, k).Result()
	if n == 1 {
		c.rdb.Expire(ctx, k, LoginFailTTL)
	}
}

func (c *Cache) LoginSucceeded(ctx context.Context, key string) {
	c.rdb.Del(ctx, "login_fail:"+key)
}

// GetJSON читает значение кэша; возвращает false, если ключа нет.
func (c *Cache) GetJSON(ctx context.Context, name string, dst any) bool {
	data, err := c.rdb.Get(ctx, "cache:"+name).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dst) == nil
}

func (c *Cache) SetJSON(ctx context.Context, name string, v any, ttl time.Duration) {
	data, err := json.Marshal(v)
	if err == nil {
		c.rdb.Set(ctx, "cache:"+name, data, ttl)
	}
}

// Invalidate удаляет записи кэша по именам вместе с производными
// ключами вида «имя:...» (например, статистика отдельных пользователей).
func (c *Cache) Invalidate(ctx context.Context, names ...string) {
	for _, n := range names {
		c.rdb.Del(ctx, "cache:"+n)
		iter := c.rdb.Scan(ctx, 0, "cache:"+n+":*", 100).Iterator()
		for iter.Next(ctx) {
			c.rdb.Del(ctx, iter.Val())
		}
	}
}

var ErrLocked = errors.New("ресурс занят другим пользователем")

// unlockScript удаляет ключ, только если он принадлежит владельцу блокировки.
var unlockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0`)

// Lock захватывает распределённую блокировку по нескольким ключам.
// Ключи захватываются по очереди; при неудаче освобождаются уже захваченные.
// Возвращает функцию освобождения блокировки.
func (c *Cache) Lock(ctx context.Context, ttl time.Duration, keys ...string) (func(), error) {
	owner := randomToken(16)
	taken := make([]string, 0, len(keys))
	release := func() {
		for _, k := range taken {
			unlockScript.Run(context.Background(), c.rdb, []string{"lock:" + k}, owner)
		}
	}
	for _, k := range keys {
		ok := false
		for attempt := 0; attempt < 20 && !ok; attempt++ {
			var err error
			ok, err = c.rdb.SetNX(ctx, "lock:"+k, owner, ttl).Result()
			if err != nil {
				release()
				return nil, err
			}
			if !ok {
				time.Sleep(50 * time.Millisecond)
			}
		}
		if !ok {
			release()
			return nil, ErrLocked
		}
		taken = append(taken, k)
	}
	return release, nil
}
