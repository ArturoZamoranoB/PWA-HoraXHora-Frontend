import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Actividades = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

const aceptarSolicitud = async (id) => {
  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return;
  }

  if (!window.confirm("¿Quieres aceptar esta actividad?")) return;

  try {
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

    // ✔ ONLINE y aceptada correctamente
    if (res.ok) {
      setSolicitudes((prev) => prev.filter((s) => s.id !== id));
      alert("Actividad aceptada y enviada a tu panel ✔");
      return;
    }

    alert(data.error || "No se pudo aceptar la actividad");
  } catch (err) {
    // ❌ ESTÁS OFFLINE → Guardar en IndexedDB
    console.warn("Offline → guardando aceptación en IndexedDB");

    await addPendingAccept({
      url: `https://pwa-horaxhora-backend.onrender.com/api/solicitudes/${id}/aceptar`,
      token,
    });

    // Registrar sincronización
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("sync-accepted");
    }

    // Quitarla de la UI como si ya estuviera aceptada
    setSolicitudes((prev) => prev.filter((s) => s.id !== id));

    alert("Actividad aceptada offline. Se sincronizará al volver el internet.");
  }
};


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
          <p style={styles.empty}>
            No hay actividades pendientes en este momento.
          </p>
        ) : (
          <div style={styles.grid}>
            {solicitudes.map((s) => (
              <article key={s.id} style={styles.card}>
                <h3 style={styles.cardTitle}>{s.titulo}</h3>
                <p style={styles.cardAlumno}>Alumno: {s.alumno}</p>
                <p style={styles.cardFecha}>Fecha: {s.fecha}</p>
                <p style={styles.cardDesc}>
                  {s.descripcion || "Sin descripción."}
                </p>
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
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'",
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
    fontWeight: 500,
    whiteSpace: "nowrap",
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
    boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
  },
  cardTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 700,
  },
  cardAlumno: {
    margin: "0.4rem 0 0.1rem",
    fontSize: "0.9rem",
    color: "#bbf7d0",
  },
  cardFecha: {
    margin: "0 0 0.5rem",
    fontSize: "0.8rem",
    color: "#86efac",
  },
  cardDesc: {
    fontSize: "0.9rem",
    color: "#e5e7eb",
    marginBottom: "0.75rem",
  },
  acceptBtn: {
    width: "100%",
    padding: "0.55rem",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    background:
      "linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%)",
    color: "#052e16",
    fontWeight: 700,
    fontSize: "0.9rem",
  },
  empty: {
    textAlign: "center",
    marginTop: "2rem",
    fontSize: "0.95rem",
    color: "#cbd5f5",
  },
};

export default Actividades;
