// Готові категорії: людська назва → OSM-теги (усі мають збігатися).
export const PRESETS = [
  { id: "cafe",       icon: "☕", label: "Кафе",          tags: ["amenity=cafe"] },
  { id: "restaurant", icon: "🍽️", label: "Ресторани",     tags: ["amenity=restaurant"] },
  { id: "fast_food",  icon: "🍔", label: "Фастфуд",       tags: ["amenity=fast_food"] },
  { id: "bar",        icon: "🍺", label: "Бари та паби",  tags: ["amenity=bar"] },
  { id: "pharmacy",   icon: "💊", label: "Аптеки",        tags: ["amenity=pharmacy"] },
  { id: "hospital",   icon: "🏥", label: "Лікарні",       tags: ["amenity=hospital"] },
  { id: "atm",        icon: "🏧", label: "Банкомати",     tags: ["amenity=atm"] },
  { id: "bank",       icon: "🏦", label: "Банки",         tags: ["amenity=bank"] },
  { id: "fuel",       icon: "⛽", label: "АЗС",           tags: ["amenity=fuel"] },
  { id: "charging",   icon: "🔌", label: "Зарядки EV",    tags: ["amenity=charging_station"] },
  { id: "parking",    icon: "🅿️", label: "Паркінги",      tags: ["amenity=parking"] },
  { id: "toilets",    icon: "🚻", label: "Туалети",       tags: ["amenity=toilets"] },
  { id: "supermarket",icon: "🛒", label: "Супермаркети",  tags: ["shop=supermarket"] },
  { id: "bakery",     icon: "🥐", label: "Пекарні",       tags: ["shop=bakery"] },
  { id: "hotel",      icon: "🛏️", label: "Готелі",        tags: ["tourism=hotel"] },
  { id: "museum",     icon: "🏛️", label: "Музеї",         tags: ["tourism=museum"] },
  { id: "park",       icon: "🌳", label: "Парки",         tags: ["leisure=park"] },
  { id: "playground", icon: "🛝", label: "Дитячі майданчики", tags: ["leisure=playground"] },
  { id: "school",     icon: "🏫", label: "Школи",         tags: ["amenity=school"] },
  { id: "bus_stop",   icon: "🚏", label: "Зупинки",       tags: ["highway=bus_stop"] },
];

export const presetById = id => PRESETS.find(p => p.id === id) || null;

// Тип об'єкта людською мовою → значення `kind` бекенду ("" = усі).
export const KINDS = [
  { value: "",         label: "Усе" },
  { value: "node",     label: "Точки" },
  { value: "way",      label: "Будівлі та лінії" },
  { value: "relation", label: "Складні об'єкти" },
];

export const MIN_RADIUS = 100;
export const MAX_RADIUS = 5000;
