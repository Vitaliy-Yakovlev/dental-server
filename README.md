# Dental Appointment Booking Server

Сервер для інтеграції форми запису на прийом з CRM системою ClinicCards.

## Живий сервер

🚀 **Prod Environment**: <https://dental-server-cdv4.onrender.com/>

Сервер развернут на платформе Render и готов к использованию.

## Налаштування

### 1. Встановлення залежностей

```bash
npm install
```

### 2. Налаштування змінних середовища

Скопіюйте файл `.env.example` в `.env` та налаштуйте параметри:

```env
# CRM API Configuration
CRM_API_BASE_URL=https://cliniccards.com/api
CRM_API_TOKEN=YOUR_API_TOKEN_HERE

# Server Configuration
PORT=3000
NODE_ENV=development

# Default Doctor and Cabinet IDs (adjust according to your CRM setup)
DEFAULT_DOCTOR_ID=11111
CABINET_1_ID=10000
CABINET_2_ID=20000

# Working Hours
WORK_START_HOUR=9
WORK_END_HOUR=19
APPOINTMENT_DURATION_MINUTES=30
```

### 3. Запуск сервера

Для розробки:

```bash
npm run dev
```

Для продакшену:

```bash
npm start
```

## API Endpoints

### GET /api/available-times/:date

Отримує доступні часові слоти для конкретної дати.

**Параметри:**

- `date` - дата у форматі YYYY-MM-DD

**Відповідь:**

```json
{
  "date": "2024-01-15",
  "availableSlots": ["09:00", "09:30", "10:00", ...],
  "totalSlots": 20,
  "occupiedSlots": {
    "cabinet1": ["10:00", "11:00"],
    "cabinet2": ["09:30"]
  }
}
```

### POST /api/book-appointment

Створює пацієнта та запис на прийом.

**Тіло запиту:**

```json
{
  "firstName": "Іван",
  "lastName": "Петренко",
  "phone": "+380991234567",
  "email": "ivan@example.com",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "10:00",
  "gender": "M",
  "address": "вул. Прикладна, 1",
  "note": "Додаткова інформація"
}
```

**Відповідь:**

```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "data": {
    "patientId": "12345",
    "visitId": "67890",
    "cabinetId": "10000",
    "appointmentDate": "2024-01-15",
    "appointmentTime": "10:00",
    "endTime": "10:30"
  }
}
```

### GET /api/cabinets

Отримує список кабінетів з CRM.

### GET /api/health

Перевірка стану сервера.

## Логіка роботи

1. **Отримання доступних часів:**
   - Генерує всі можливі часові слоти для робочого дня
   - Перевіряє зайнятість по кожному кабінету
   - Повертає слоти, де хоча б один кабінет вільний

2. **Створення запису:**
   - Створює пацієнта в CRM
   - Визначає вільний кабінет для обраного часу
   - Створює запис на прийом

3. **Обробка помилок:**
   - Валідація даних
   - Перевірка доступності часу
   - Обробка помилок CRM API

## Інтеграція з фронтендом

Сервер налаштований для роботи з CORS, тому фронтенд може робити запити з будь-якого домену.

Приклад використання з JavaScript:

```javascript
// Отримання доступних часів
const response = await fetch('https://dental-server-cdv4.onrender.com/api/available-times/2024-01-15');
const data = await response.json();

// Створення запису
const bookingResponse = await fetch('https://dental-server-cdv4.onrender.com/api/book-appointment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: 'Іван',
    lastName: 'Петренко',
    phone: '+380991234567',
    email: 'ivan@example.com',
    appointmentDate: '2024-01-15',
    appointmentTime: '10:00'
  })
});
```

## Локальна розробка

Для локального тестування використовуйте:

```
http://localhost:3000
```
