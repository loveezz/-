"use client";
import { use } from "react";
import { Printer, X } from "lucide-react";
import { Button, ErrorBox, Loader } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { date, money, num, time, coef } from "@/lib/format";
import { STATUS } from "@/lib/statuses";
import type { Order } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="w-[34%] border border-black px-2 py-1 align-top">{label}</td>
      <td className="border border-black px-2 py-1 align-top">{children}</td>
    </tr>
  );
}

// Печатная форма заявки на перевозку груза (формат A4, чёрно-белая).
export default function PrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: o, error, loading } = useApi<Order>(`/orders/${id}`);
  if (loading) return <Loader />;
  if (error || !o) return <ErrorBox message={error ?? "Заявка не найдена"} />;
  const distanceCost = o.distance_km * o.price_per_km;

  return (
    <div className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex w-[210mm] justify-end gap-2">
        <Button variant="secondary" icon={<X className="size-4" />} onClick={() => window.close()}>Закрыть</Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()} data-print-button>Печать</Button>
      </div>
      <div className="mx-auto w-[210mm] bg-white px-[18mm] py-[15mm] text-[12.5px] leading-snug text-black shadow-lg print:shadow-none" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
        <div className="flex justify-between text-[11px]">
          <span>ООО «ГрузЛайн», г. Екатеринбург</span>
          <span>Статус: {STATUS[o.status].label.toLowerCase()}</span>
        </div>
        <h1 className="mt-6 text-center text-[17px] font-bold uppercase">Заявка на перевозку груза № {o.id}</h1>
        <p className="mb-5 text-center">от {date(o.created_at)}</p>

        <table className="w-full border-collapse">
          <tbody>
            <Row label="Заказчик">{o.client_name}{o.client_inn && `, ИНН ${o.client_inn}`}, тел. {o.client_phone}</Row>
            <Row label="Перевозчик">ООО «ГрузЛайн»</Row>
            <Row label="Маршрут">{o.from_city} — {o.to_city} ({o.route_code}), {num(o.distance_km)} км</Row>
            <Row label="Погрузка">{date(o.starts_at)} в {time(o.starts_at)}; {o.pickup_address}</Row>
            <Row label="Выгрузка (плановая)">{date(o.ends_at)} в {time(o.ends_at)}; {o.delivery_address}</Row>
            <Row label="Наименование груза">{o.cargo_description}</Row>
            <Row label="Тип груза">{o.cargo_type_name}</Row>
            <Row label="Масса / объём">{num(o.weight_kg)} кг / {num(o.volume_m3, 1)} м³</Row>
            <Row label="Тип кузова">{o.body_type_name}</Row>
            <Row label="Транспортное средство">{o.vehicle_plate ? `${o.vehicle_model}, госномер ${o.vehicle_plate}` : "назначается диспетчером"}</Row>
            <Row label="Водитель">{o.driver_name ? `${o.driver_name}, тел. ${o.driver_phone}` : "назначается диспетчером"}</Row>
          </tbody>
        </table>

        <h2 className="mb-2 mt-6 font-bold">Расчёт стоимости перевозки</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left font-bold">Показатель</th>
              <th className="w-[30%] border border-black px-2 py-1 text-right font-bold">Значение</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border border-black px-2 py-1">Тариф</td><td className="border border-black px-2 py-1 text-right">{o.tariff_name}</td></tr>
            <tr><td className="border border-black px-2 py-1">Подача машины</td><td className="border border-black px-2 py-1 text-right">{money(o.base_price)}</td></tr>
            <tr><td className="border border-black px-2 py-1">Пробег: {num(o.distance_km)} км × {num(o.price_per_km)} ₽/км</td><td className="border border-black px-2 py-1 text-right">{money(distanceCost)}</td></tr>
            <tr><td className="border border-black px-2 py-1">Коэффициент типа груза</td><td className="border border-black px-2 py-1 text-right">× {coef(o.coefficient)}</td></tr>
            <tr><td className="border border-black px-2 py-1">Минимальная стоимость заказа</td><td className="border border-black px-2 py-1 text-right">{money(o.min_price)}</td></tr>
            <tr><td className="border border-black px-2 py-1 font-bold">Итого к оплате</td><td className="border border-black px-2 py-1 text-right font-bold">{money(o.cost)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11px]">Стоимость рассчитана по формуле: С = max(Смин; (Сподачи + L × Скм) × Кгруза).</p>

        <div className="mt-14 grid grid-cols-2 gap-12">
          <div>
            <p className="font-bold">Заказчик</p>
            <p className="mt-10 border-t border-black pt-1 text-[11px]">подпись / расшифровка</p>
          </div>
          <div>
            <p className="font-bold">Перевозчик (диспетчер)</p>
            <p className="mt-10 border-t border-black pt-1 text-[11px]">подпись / расшифровка</p>
          </div>
        </div>
        <p className="mt-6 text-[11px]">М. П.</p>
      </div>
    </div>
  );
}
