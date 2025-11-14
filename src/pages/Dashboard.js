import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    const fetchSolicitudes = async () => {
      try {
        const res = await fetch("http://localhost:4000/api/solicitudes/aceptadas", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Error al obtener solicitudes");
          return;
        }

        setSolicitudes(data.solicitudes);
      } catch (err) {
        console.error(err);
        alert("Error de conexión");
      }
    };

    fetchSolicitudes();
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Tus Solicitudes Aceptadas</h1>
        <button style={styles.logoutBtn} onClick={logout}>
          Cerrar sesión
        </button>
      </div>

      <div style={styles.list}>
        {solicitudes.length === 0 ? (
          <p style={styles.empty}>Aún no tienes solicitudes aceptadas.</p>
        ) : (
          solicitudes.map((s) => (
            <div key={s.id} style={styles.card}>
              <h3 style={styles.cardTitle}>{s.titulo}</h3>
              <p><strong>Fecha:</strong> {s.fecha}</p>
              <p><strong>Descripción:</strong> {s.descripcion}</p>
              <p><strong>Usuario:</strong> {s.usuario}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: "2rem",
    minHeight: "100vh",
    background: "#f3f4f6",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "2rem",
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: "bold",
  },
  logoutBtn: {
    background: "#dc2626",
    color: "#fff",
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  card: {
    background: "#fff",
    padding: "1rem",
    borderRadius: "10px",
    boxShadow: "0 5px 10px rgba(0,0,0,0.08)",
  },
  cardTitle: {
    margin: 0,
    marginBottom: "0.5rem",
    fontSize: "1.2rem",
    fontWeight: "bold",
  },
  empty: {
    textAlign: "center",
    fontSize: "1rem",
    color: "#777",
  },
};

export default Dashboard;
