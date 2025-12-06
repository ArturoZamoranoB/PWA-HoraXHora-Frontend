import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [online, setOnline] = useState(true);
  const [user, setUser] = useState({
    id: null,
    name: "",
    email: "",
    avatarUrl: "",
    created_at: "",
  });

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const checkOnline = async () => {
      if (!navigator.onLine) return setOnline(false);
      try {
        await fetch("https://www.google.com", { mode: "no-cors" });
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    checkOnline();

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch("https://pwa-horaxhora-backend.onrender.com/api/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "No fue posible obtener el perfil");
          if (res.status === 401) {
            localStorage.removeItem("token");
            navigate("/login");
          }
          return;
        }
        const u = data.user || data;
        setUser((prev) => ({
          ...prev,
          id: u.id ?? prev.id,
          name: u.name ?? u.nombre ?? prev.name,
          email: u.email ?? prev.email,
          avatarUrl: u.avatarUrl ?? prev.avatarUrl ?? "",
          created_at: u.created_at ?? prev.created_at,
        }));
      } catch (err) {
        console.error(err);
        alert("Error de conexión al obtener perfil");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate, token]);

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

   const goToDashboard = () => {
    navigate("/dashboard");
  };

  const [form, setForm] = useState({ name: "", email: "" });
  useEffect(() => {
    setForm({ name: user.name, email: user.email });
  }, [user]);

  const handleSave = async () => {
    if (!token) return;

    if (!form.name || !form.email) return alert("Completa los datos");

    try {
      const res = await fetch("http://localhost:4000/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: form.name, email: form.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        return alert(data.error || "Error al actualizar perfil");
      }
      setUser((u) => ({ ...u, name: data.user?.name ?? form.name, email: data.user?.email ?? form.email }));
      setEditing(false);
      alert("Perfil actualizado correctamente");
    } catch (err) {
      console.error(err);
      alert("Error de conexión al actualizar perfil");
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Perfil</h1>
            <p style={styles.subtitle}>Administra tu información</p>
          </div>

          <div style={styles.headerControls}>
            <button style={styles.primaryBtn} onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancelar" : "Editar perfil"}
            </button>
            <button style={styles.logoutBtn} onClick={goToDashboard}> ← Regresar al Dashboard</button>
            <button style={styles.logoutBtn} onClick={logout}>Cerrar sesión</button>
          </div>
        </header>
        
        
        <div style={styles.statusRow}>
          <div style={{...styles.statusBadge, background: online ? "rgba(34,197,94,0.12)" : "#7f1d1d"}} >
            {online ? "En línea" : "Sin conexión"}
          </div>
          <div style={styles.smallMuted}>
            Usuario ID: {user.id ?? "—"} · Creado: {user.created_at ? user.created_at.split("T")[0] : "—"}
          </div>
        </div>

        <main style={styles.main}>
          <aside style={styles.cardLeft}>
            <div style={styles.avatarWrap}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" style={styles.avatar} />
              ) : (
                <div style={styles.avatarFallback}>
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
            </div>

            <div style={styles.info}>
              <div style={styles.infoLabel}>Nombre</div>
              <div style={styles.infoValue}>{user.name || "—"}</div>

              <div style={styles.infoLabel}>Correo</div>
              <div style={styles.infoValue}>{user.email || "—"}</div>
            </div>
          </aside>

          <section style={styles.cardRight}>
            {loading ? (
              <p style={styles.center}>Cargando perfil...</p>
            ) : editing ? (
              <>
                <label style={styles.label}>Nombre</label>
                <input style={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

                <label style={styles.label}>Correo</label>
                <input style={styles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button style={styles.saveBtn} onClick={handleSave}>Guardar</button>
                  <button style={styles.ghostBtn} onClick={() => setEditing(false)}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={styles.sectionTitle}>Resumen</h2>
                <p style={styles.pMuted}>Aquí puedes ver tu información y editarla cuando lo necesites.</p>

                <div style={styles.metrics}>
                  <div style={styles.metric}>
                    <div style={styles.metricLabel}>Solicitudes aceptadas</div>
                    <div style={styles.metricValue}> {/* podrías pedir al backend */} 3 </div>
                  </div>
                  <div style={styles.metric}>
                    <div style={styles.metricLabel}>Actividades creadas</div>
                    <div style={styles.metricValue}> 10 </div>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <h3 style={styles.h3}>Seguridad</h3>
                  <p style={styles.pMuted}>Para cambiar tu contraseña usa el formulario de recuperación o implementa una ruta específica.</p>
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, #062b66 0, #000612 50%, #000 100%)",
    padding: 20,
    boxSizing: "border-box",
    color: "#e6eef8",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 8px 30px rgba(2,6,23,0.6)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 22, fontWeight: 800 },
  subtitle: { margin: 0, color: "#9fb6d6", fontSize: 13 },
  headerControls: { display: "flex", gap: 10 },
  primaryBtn: {
    background: "linear-gradient(90deg,#0ea5e9,#6366f1)",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
  },
  logoutBtn: {
    background: "linear-gradient(90deg,#fb923c,#ef4444)",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
  },
  statusRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 12 },
  statusBadge: { padding: "6px 10px", borderRadius: 999, color: "#0f172a", fontWeight: 700 },
  smallMuted: { color: "#9fb6d6", fontSize: 12 },

  main: { display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" },
  cardLeft: {
    flex: "0 0 260px",
    background: "rgba(255,255,255,0.02)",
    padding: 16,
    borderRadius: 12,
    minHeight: 200,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
  },
  avatarWrap: { display: "flex", justifyContent: "center" },
  avatar: { width: 120, height: 120, borderRadius: 20, objectFit: "cover" },
  avatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 40,
    background: "linear-gradient(90deg,#0ea5e9,#6366f1)",
    color: "#fff",
    fontWeight: 800,
  },
  info: { marginTop: 12 },
  infoLabel: { fontSize: 12, color: "#9fb6d6", marginTop: 10 },
  infoValue: { fontSize: 15, fontWeight: 700 },

  cardRight: {
    flex: "1 1 400px",
    background: "rgba(255,255,255,0.02)",
    padding: 16,
    borderRadius: 12,
    minHeight: 200,
  },
  center: { textAlign: "center", color: "#9fb6d6" },
  label: { display: "block", color: "#9fb6d6", fontSize: 13, marginTop: 10 },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    marginTop: 6,
    background: "rgba(255,255,255,0.01)",
    color: "#ffffff",
  },
  saveBtn: {
    background: "linear-gradient(90deg,#10b981,#06b6d4)",
    color: "#052023",
    fontWeight: 700,
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#9fb6d6",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
  sectionTitle: { margin: "0 0 8px 0" },
  pMuted: { color: "#9fb6d6" },

  metrics: { display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" },
  metric: {
    flex: "1 1 140px",
    padding: 12,
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    textAlign: "left",
  },
  metricLabel: { fontSize: 12, color: "#9fb6d6" },
  metricValue: { fontSize: 20, fontWeight: 800 },
  h3: { margin: "12px 0 6px 0" },
};

export default Profile;
