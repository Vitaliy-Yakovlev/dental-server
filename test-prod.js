// Тестовий скрипт для продакшн сервера
const axios = require("axios");

const PROD_BASE_URL = "https://dental-server-cdv4.onrender.com";

async function testProductionServer() {
  console.log("Тестування продакшн сервера за адресою:", PROD_BASE_URL);

  try {
    // Тестування endpoint здоров'я
    console.log("\nТестування /api/health...");
    const healthResponse = await axios.get(`${PROD_BASE_URL}/api/health`);
    console.log("✅ Перевірка здоров'я:", healthResponse.data);

    // Тестування endpoint доступних часів
    console.log("\nТестування /api/available-times...");
    const today = new Date().toISOString().split("T")[0];
    const timesResponse = await axios.get(
      `${PROD_BASE_URL}/api/available-times/${today}`
    );
    console.log("✅ Доступні часи:", {
      date: timesResponse.data.date,
      totalSlots: timesResponse.data.totalSlots,
      availableSlotsCount: timesResponse.data.availableSlots.length,
    });

    // Тестування endpoint кабінетів
    console.log("\nТестування /api/cabinets...");
    const cabinetsResponse = await axios.get(`${PROD_BASE_URL}/api/cabinets`);
    console.log("✅ Кабінети:", cabinetsResponse.data);

    console.log("\n🎉 Всі тести пройдено! Продакшн сервер працює правильно.");
  } catch (error) {
    console.error("❌ Тест провалився:", error.message);
    if (error.response) {
      console.error("Дані відповіді:", error.response.data);
      console.error("Статус:", error.response.status);
    }
  }
}

// Запуск тесту
if (require.main === module) {
  testProductionServer();
}

module.exports = { testProductionServer };
