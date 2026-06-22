import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL?.includes("neon") ||
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function setup() {
  const client = await pool.connect();

  try {
    console.log("Creating database schema...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'student',
        avatar VARCHAR(10),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        roll_number VARCHAR(20),
        class VARCHAR(50),
        section VARCHAR(10),
        gender VARCHAR(10),
        date_of_birth DATE,
        blood_group VARCHAR(5),
        house VARCHAR(50),
        photo_url TEXT,
        guardian_name VARCHAR(255),
        guardian_phone VARCHAR(20),
        guardian_email VARCHAR(255),
        guardian_cnic VARCHAR(20),
        guardian_relationship VARCHAR(50),
        guardian_occupation VARCHAR(100),
        address TEXT,
        session VARCHAR(20),
        campus VARCHAR(50),
        previous_school VARCHAR(255),
        religion VARCHAR(50),
        admission_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS teachers (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(20),
        subject VARCHAR(100),
        department VARCHAR(100),
        qualification VARCHAR(100),
        joining_date DATE,
        class_teacher_of VARCHAR(50),
        status VARCHAR(20) DEFAULT 'active',
        salary DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Schema created.");

    const { rows } = await client.query("SELECT COUNT(*) FROM users");
    const count = parseInt(rows[0].count);

    if (count === 0) {
      console.log("Seeding demo data...");

      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("admin123", 10);

      await client.query(
        `
        INSERT INTO users (name, email, password_hash, role, avatar)
        VALUES
        ('Ahmad Raza', 'superadmin@evershine.edu', $1, 'superadmin', 'AR'),
        ('Fatima Khan', 'admin@evershine.edu', $1, 'admin', 'FK'),
        ('Dr. Kamran Siddiqui', 'principal@evershine.edu', $1, 'principal', 'KS'),
        ('Imran Hussain', 'imran@evershine.edu', $1, 'teacher', 'IH'),
        ('Sana Malik', 'accountant@evershine.edu', $1, 'accountant', 'SM'),
        ('Tariq Mehmood', 'tariq@gmail.com', $1, 'guardian', 'TM'),
        ('Ali Hassan', 'ali@student.evershine.edu', $1, 'student', 'AH')
        `,
        [hash]
      );

      console.log("Demo users seeded.");
    }

    console.log("Database setup complete!");
  } catch (err) {
    console.error("Setup error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(console.error);