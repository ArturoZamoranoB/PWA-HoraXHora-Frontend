import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addPendingAccept } from "../utils/idb"; // ✔ NECESARIO

const Actividades = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  /* ---------------------------------------------------------
     Cargar actividades pendientes (online)
  --------------------------------------------------------- */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchPendientes = async () => {
      try {
        const res = await fetch(
          "https://pwa-horaxhora-backend.onrender.com/api/solicitudes/pendientes",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Error al cargar actividades");
          return;
        }

        setSolicitudes(data.solicitudes || []);
      } catch (err) {
        console.error(err);
        alert("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    fetchPendientes();
  }, [navigate]);

  /* ---------------------------------------------------------
     Aceptar solicitud (Online + Offline)
  --------------------------------------------------------- */
  const aceptarSolicitud = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    if (!window.confirm("¿Quieres aceptar esta actividad?")) return;

    try {
      // ✔ Intento online
      const res = await fetch(
        `https://pwa-horaxhora-backend.onrender.com/api/solicitudes/${id}/aceptar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (res.ok) {
        // ONLINE → Actualizar UI
        setSolicitudes((prev) => prev.filter((s) => s.id !== id));
        alert("Actividad aceptada y enviada a tu panel ✔");
        return;
      }

      alert(data.error || "No se pudo aceptar la actividad");
    } catch (err) {
      // ❌ OFFLINE → Guardar en IndexedDB
      console.warn("📌 OFFLINE → Guardando aceptación en IndexedDB");

      await addPendingAccept({
        id: Date.now(),
        url: `https://pwa-horaxhora-backend.onrender.com/api/solicitudes/${id}/aceptar`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Registrar sync
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register("sync-accepted");
      }

      // Mostrar como aceptada
      setSolicitudes((prev) => prev.filter((s) => s.id !== id));

      alert("Actividad aceptada offline. Se enviará automáticamente al reconectar.");
    }
  };

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */
  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Actividades disponibles</h1>
            <p style={styles.subtitle}>
              Elige las actividades que quieres tomar. Las aceptadas
              desaparecerán de esta lista y aparecerán en tu panel.
            </p>
          </div>

          <button style={styles.btnSec} onClick={() => navigate("/dashboard")}>
            Ir a mi panel
          </button>
        </header>

        {loading ? (
          <p style={styles.empty}>Cargando actividades...</p>
        ) : solicitudes.length === 0 ? (
          <p style={styles.empty}>No hay actividades pendientes en este momento.</p>
        ) : (
          <div style={styles.grid}>
            {solicitudes.map((s) => (
              <article key={s.id} style={styles.card}>
                <h3 style={styles.cardTitle}>{s.titulo}</h3>
                <p style={styles.cardAlumno}>Alumno: {s.alumno}</p>
                <p style={styles.cardFecha}>Fecha: {s.fecha}</p>
                <p style={styles.cardDesc}>{s.descripcion || "Sin descripción."}</p>

                <button
                  style={styles.acceptBtn}
                  onClick={() => aceptarSolicitud(s.id)}
                >
                  Aceptar actividad
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------
   ESTILOS
--------------------------------------------------------- */

const styles = {
  wrapper: {
    minHeight: "100vh",
    padding: "1rem",
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at top, #22c55e 0, #020617 40%, #000000 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  container: {
    width: "100%",
    maxWidth: "1100px",
    color: "#e5e7eb",
    fontFamily: "system-ui",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
    alignItems: "center",
    marginBottom: "1.2rem",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "1.8rem",
    fontWeight: 800,
  },
  subtitle: {
    margin: "0.3rem 0 0",
    fontSize: "0.9rem",
    color: "#cbd5f5",
    maxWidth: "520px",
  },
  btnSec: {
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.7)",
    background: "rgba(15,23,42,0.7)",
    padding: "0.5rem 1rem",
    color: "#e5e7eb",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "rgba(15,23,42,0.9)",
    borderRadius: "1rem",
    padding: "1rem",
    border: "1px solid rgba(34,197,94,0.4)",
  },
  cardTitle: { margin: 0, fontSize: "1.1rem", fontWeight: 700 },
  cardAlumno: { margin: "0.4rem 0 0.1rem", fontSize: "0.9rem", color: "#bbf7d0" },
  cardFecha: { margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#86efac" },
  cardDesc: { fontSize: "0.9rem", marginBottom: "0.75rem" },
  acceptBtn: {
    width: "100%",
    padding: "0.55rem",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    background:
      "linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%)",
    fontWeight: 700,
  },
  empty: {
    textAlign: "center",
    marginTop: "2rem",
    fontSize: "0.95rem",
    color: "#cbd5f5",
  },
};

export default Actividades;
