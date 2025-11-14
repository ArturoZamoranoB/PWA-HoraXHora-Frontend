import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const Register = () => {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
  e.preventDefault();

  if (password !== password2) {
    alert("Las contraseñas no coinciden");
    return;
  }

  try {
    const res = await fetch("http://localhost:4000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error al registrarse");
      return;
    }


    console.log("Usuario registrado:", data.user);

    alert("Registro exitoso, ahora inicia sesión");
    navigate("/login");
  } catch (err) {
    console.error(err);
    alert("Error de conexión con el servidor");
  }
};

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Hora x Hora</h1>
        <h2 style={styles.subtitle}>Crear cuenta</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Nombre</label>
          <input
            type="text"
            style={styles.input}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />

          <label style={styles.label}>Correo electrónico</label>
          <input
            type="email"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label style={styles.label}>Contraseña</label>
          <input
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label style={styles.label}>Repite la contraseña</label>
          <input
            type="password"
            style={styles.input}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />

          <button type="submit" style={styles.button}>
            Registrarme
          </button>
        </form>

        <p style={styles.text}>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" style={styles.link}>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#e5e7eb",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    background: "#ffffff",
    padding: "2rem",
    borderRadius: "12px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  title: {
    textAlign: "center",
    marginBottom: "0.25rem",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: "1.5rem",
    color: "#555",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  label: {
    fontSize: "0.9rem",
    color: "#333",
  },
  input: {
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "0.95rem",
  },
  button: {
    marginTop: "0.5rem",
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
    background: "#16a34a",
    color: "#fff",
  },
  text: {
    marginTop: "1rem",
    textAlign: "center",
    fontSize: "0.9rem",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: "bold",
  },
};

export default Register;
