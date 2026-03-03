const mysql = require("mysql2/promise");

let pool;

// Detectar si estamos en Railway (usando MYSQL_URL) o en Hostinger/local
if (process.env.MYSQL_URL) {
  // ============================================
  // MODO RAILWAY - Usa la URL completa
  // ============================================
  console.log("🚀 Conectando a MySQL en Railway...");
  console.log("📌 Usando MYSQL_URL");

  pool = mysql.createPool(process.env.MYSQL_URL);
} else {
  // ============================================
  // MODO HOSTINGER/LOCAL - Usa variables individuales
  // ============================================
  console.log("📁 Conectando a MySQL en Hostinger/Local...");

  pool = mysql.createPool({
    host: process.env.DB_HOST || "193.203.175.83", // IP de Hostinger
    user: process.env.DB_USER || "u617147599_MindLag", // Usuario
    password: process.env.DB_PASSWORD || "Micronics159357", // Contraseña
    database: process.env.DB_NAME || "u617147599_SalaQlo", // Base de datos
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "Z",
  });
}

// Probar conexión
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión a MySQL exitosa");

    // Mostrar información según el modo
    if (process.env.MYSQL_URL) {
      console.log("📊 Modo: Railway");
    } else {
      console.log("📊 Base de datos:", connection.config.database);
      console.log("📊 Host:", connection.config.host);
    }

    connection.release();
  } catch (error) {
    console.error("❌ Error conectando a MySQL:", error.message);
    console.error("   Detalles:", error);
  }
}

testConnection();

module.exports = pool;
