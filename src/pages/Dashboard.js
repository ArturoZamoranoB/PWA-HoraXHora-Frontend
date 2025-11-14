import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();


  useEffect(() => {
    const updateStatus = () => {
      setOnline(navigator.onLine);
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

 
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768); 
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

 
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    const fetchSolicitudes = async () => {
      try {
        const res = await fetch(
          "http://localhost:4000/api/solicitudes/aceptadas",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Error al obtener solicitudes");
          return;
        }

        setSolicitudes(data.solicitudes || []);
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

  const goToActividades = () => {
    navigate("/actividades");
  };

  return (
    <div style={styles.wrapper}>
      {!online && (
        <div style={styles.offlineBanner}>
          Estás sin conexión. Es posible que veas datos desactualizados.
        </div>
      )}

      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <h1 style={styles.title}>Hora x Hora</h1>
            <p style={styles.subtitle}>
              Panel de <span style={styles.highlight}>solicitudes aceptadas</span>
            </p>
          </div>

          <div style={styles.headerActions}>
            <button style={styles.secondaryBtn} onClick={goToActividades}>
              Ver actividades disponibles
            </button>
            <button style={styles.logoutBtn} onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Resumen */}
        <section style={styles.summary}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Total aceptadas</span>
            <span style={styles.summaryValue}>{solicitudes.length}</span>
          </div>
          <div style={styles.summaryCardSecondary}>
            <span style={styles.summaryLabel}>Estado</span>
            {online ? (
              <span style={styles.chipOnline}>En línea</span>
            ) : (
              <span style={styles.chipOffline}>Sin conexión</span>
            )}
          </div>
        </section>

        {/* Lista */}
        <section style={styles.listSection}>
          {solicitudes.length === 0 ? (
            <p style={styles.empty}>
              Aún no tienes solicitudes aceptadas.
              <br />
              Cuando aceptes alguna, aparecerá aquí en tiempo real.
            </p>
          ) : (
            <div
              style={{
                ...styles.grid,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {solicitudes.map((s) => (
                <article key={s.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>
                      {s.titulo || "Solicitud sin título"}
                    </h3>
                    <span style={styles.badge}>Aceptada</span>
                  </div>
                  <p style={styles.cardDesc}>
                    {s.descripcion || "Sin descripción registrada."}
                  </p>
                  <div style={styles.cardMeta}>
                    <p style={styles.metaItem}>
                      <span style={styles.metaLabel}>Fecha</span>
                      <span style={styles.metaValue}>
                        {s.fecha || "Sin fecha"}
                      </span>
                    </p>
                    <p style={styles.metaItem}>
                      <span style={styles.metaLabel}>Usuario</span>
                      <span style={styles.metaValue}>
                        {s.usuario || "Anónimo"}
                      </span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
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
      "radial-gradient(circle at top, #1d4ed8 0, #020617 40%, #000000 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  offlineBanner: {
    background: "#b91c1c",
    color: "#fee2e2",
    padding: "0.5rem 1.2rem",
    borderRadius: "999px",
    marginBottom: "0.8rem",
    fontSize: "0.85rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    textAlign: "center",
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
  headerLeft: {
    minWidth: "200px",
  },
  headerActions: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  title: {
    fontSize: "1.8rem",
    margin: 0,
    fontWeight: 800,
    letterSpacing: "0.03em",
  },
  subtitle: {
    margin: "0.25rem 0 0",
    fontSize: "0.9rem",
    color: "#9ca3af",
  },
  highlight: {
    color: "#38bdf8",
    fontWeight: "600",
  },
  logoutBtn: {
    background:
      "linear-gradient(135deg, #dc2626 0%, #f97316 50%, #facc15 100%)",
    color: "#fff",
    padding: "0.55rem 1rem",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
    boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
    whiteSpace: "nowrap",
  },
  secondaryBtn: {
    background: "rgba(15,23,42,0.8)",
    color: "#e5e7eb",
    padding: "0.55rem 1rem",
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.7)",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
  },
  summary: {
    display: "flex",
    gap: "0.8rem",
    flexWrap: "wrap",
    marginBottom: "1.2rem",
  },
  summaryCard: {
    flex: "1 1 180px",
    padding: "0.9rem 1rem",
    borderRadius: "1rem",
    background:
      "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(59,130,246,0.05))",
    border: "1px solid rgba(56,189,248,0.4)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.7)",
  },
  summaryCardSecondary: {
    flex: "1 1 180px",
    padding: "0.9rem 1rem",
    borderRadius: "1rem",
    background: "rgba(15,23,42,0.7)",
    border: "1px solid rgba(148,163,184,0.4)",
    boxShadow: "0 10px 24px rgba(15,23,42,0.7)",
  },
  summaryLabel: {
    fontSize: "0.8rem",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  summaryValue: {
    display: "block",
    marginTop: "0.3rem",
    fontSize: "1.6rem",
    fontWeight: 700,
  },
  chipOnline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    marginTop: "0.4rem",
    padding: "0.2rem 0.7rem",
    borderRadius: "999px",
    background: "rgba(34,197,94,0.15)",
    color: "#4ade80",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  chipOffline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    marginTop: "0.4rem",
    padding: "0.2rem 0.7rem",
    borderRadius: "999px",
    background: "rgba(239,68,68,0.15)",
    color: "#fca5a5",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  listSection: {
    marginBottom: "1rem",
  },
  grid: {
    display: "grid",
    gap: "0.9rem",
  },
  card: {
    background: "rgba(15,23,42,0.88)",
    borderRadius: "1rem",
    padding: "0.9rem 1rem",
    border: "1px solid rgba(148,163,184,0.35)",
    boxShadow: "0 14px 35px rgba(0,0,0,0.7)",
    backdropFilter: "blur(12px)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "0.35rem",
  },
  cardTitle: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 600,
  },
  badge: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: "0.15rem 0.5rem",
    borderRadius: "999px",
    background:
      "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(59,130,246,0.6))",
    color: "#e0f2fe",
    border: "1px solid rgba(56,189,248,0.7)",
    whiteSpace: "nowrap",
  },
  cardDesc: {
    fontSize: "0.9rem",
    color: "#9ca3af",
    margin: "0.2rem 0 0.6rem",
  },
  cardMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6rem",
    fontSize: "0.8rem",
  },
  metaItem: {
    display: "flex",
    flexDirection: "column",
    minWidth: "110px",
  },
  metaLabel: {
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "0.7rem",
    marginBottom: "0.1rem",
  },
  metaValue: {
    color: "#e5e7eb",
    fontWeight: 500,
  },
  empty: {
    textAlign: "center",
    fontSize: "0.9rem",
    color: "#9ca3af",
    padding: "1.8rem 1rem",
    background: "rgba(15,23,42,0.85)",
    borderRadius: "1rem",
    border: "1px dashed rgba(148,163,184,0.5)",
  },
};

export default Dashboard;
