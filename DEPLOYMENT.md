# Інформація про розгортання

## Продакшн середовище

**Сервіс**: Render
**URL**: <https://dental-server-cdv4.onrender.com/>
**Статус**: Активний

### Змінні середовища

Переконайтеся, що на Render налаштовані наступні змінні середовища:

```
CRM_API_BASE_URL=https://cliniccards.com/api
CRM_API_TOKEN=your_actual_token
NODE_ENV=production
DEFAULT_DOCTOR_ID=11111
CABINET_1_ID=10000
CABINET_2_ID=20000
WORK_START_HOUR=9
WORK_END_HOUR=19
APPOINTMENT_DURATION_MINUTES=30
```

### Перевірка здоров'я

Перевірити працездатність сервера можна за адресою:
<https://dental-server-cdv4.onrender.com/api/health>

### API Endpoints

Всі API endpoints доступні за базовою URL:

- GET <https://dental-server-cdv4.onrender.com/api/available-times/:date>
- POST <https://dental-server-cdv4.onrender.com/api/book-appointment>
- GET <https://dental-server-cdv4.onrender.com/api/cabinets>
- GET <https://dental-server-cdv4.onrender.com/api/health>

### Логи та моніторинг

Логи та моніторинг доступні в панелі управління Render.

## Альтернативні варіанти розгортання

### Vercel (налаштовано, але не використовується)

Проект також налаштований для розгортання на Vercel (див. `vercel.json`), але наразі використовується Render.

### Локальна розробка

Для локальної розробки:

```bash
npm install
npm run dev
```

Сервер буде доступний за адресою: <http://localhost:3000>
