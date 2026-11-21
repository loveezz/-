package httpapi

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	reLogin    = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,50}$`)
	reDigits   = regexp.MustCompile(`^[0-9]+$`)
	reEmail    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	reRegPlate = regexp.MustCompile(`^[АВЕКМНОРСТУХ][0-9]{3}[АВЕКМНОРСТУХ]{2}[0-9]{2,3}$`)
	reLicense  = regexp.MustCompile(`^[0-9]{10}$`)
)

// fieldErrors накапливает ошибки проверки по полям формы.
type fieldErrors map[string]string

func (f fieldErrors) add(field, msg string) {
	if _, ok := f[field]; !ok {
		f[field] = msg
	}
}

func (f fieldErrors) err() error {
	if len(f) == 0 {
		return nil
	}
	return badRequest("Проверьте правильность заполнения полей", f)
}

func (f fieldErrors) required(field, value, title string) {
	if strings.TrimSpace(value) == "" {
		f.add(field, "Заполните поле «"+title+"»")
	}
}

func (f fieldErrors) maxLen(field, value string, n int) {
	if utf8.RuneCountInString(value) > n {
		f.add(field, "Не более "+itoa(n)+" символов")
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// validLogin: латинские буквы, цифры и символы «_», «.», «-», от 3 до 50 символов.
func validLogin(s string) bool { return reLogin.MatchString(s) }

// validPassword: не короче 8 символов, содержит буквы и цифры.
func validPassword(s string) bool {
	if utf8.RuneCountInString(s) < 8 {
		return false
	}
	hasLetter, hasDigit := false, false
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			hasDigit = true
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= 'а' && r <= 'я', r >= 'А' && r <= 'Я':
			hasLetter = true
		}
	}
	return hasLetter && hasDigit
}

// normalizePhone приводит номер к виду +7 (XXX) XXX-XX-XX.
// Возвращает пустую строку, если номер некорректен.
func normalizePhone(s string) string {
	var d []byte
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			d = append(d, s[i])
		}
	}
	if len(d) == 11 && (d[0] == '8' || d[0] == '7') {
		d = d[1:]
	}
	if len(d) != 10 {
		return ""
	}
	return "+7 (" + string(d[0:3]) + ") " + string(d[3:6]) + "-" + string(d[6:8]) + "-" + string(d[8:10])
}

// validINN проверяет ИНН юридического (10 цифр) или физического лица (12 цифр)
// по контрольным разрядам.
func validINN(inn string) bool {
	if !reDigits.MatchString(inn) {
		return false
	}
	d := make([]int, len(inn))
	for i, c := range inn {
		d[i] = int(c - '0')
	}
	check := func(weights []int) int {
		sum := 0
		for i, w := range weights {
			sum += w * d[i]
		}
		return sum % 11 % 10
	}
	switch len(d) {
	case 10:
		return check([]int{2, 4, 10, 3, 5, 9, 4, 6, 8}) == d[9]
	case 12:
		return check([]int{7, 2, 4, 10, 3, 5, 9, 4, 6, 8}) == d[10] &&
			check([]int{3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8}) == d[11]
	}
	return false
}

// normalizePlate приводит госномер к верхнему регистру и заменяет
// латинские буквы на совпадающие по начертанию кириллические.
func normalizePlate(s string) string {
	repl := strings.NewReplacer("A", "А", "B", "В", "E", "Е", "K", "К", "M", "М", "H", "Н",
		"O", "О", "P", "Р", "C", "С", "T", "Т", "Y", "У", "X", "Х", " ", "")
	return repl.Replace(strings.ToUpper(strings.TrimSpace(s)))
}

func validPlate(s string) bool { return reRegPlate.MatchString(s) }

// hasCategory проверяет, что в списке категорий водителя есть требуемая.
func hasCategory(categories, need string) bool {
	for _, c := range strings.Split(categories, ",") {
		if strings.TrimSpace(c) == need {
			return true
		}
	}
	return false
}
