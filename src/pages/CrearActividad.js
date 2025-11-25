// src/pages/CrearActividad.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { addPendingActivity, getAllPendingActivities, removePendingActivity } from "../utils/idb";

const API_POST = "https://pwa-horaxhora-backend.onrender.com/api/solicitudes"; // endpoint para crear solicitudes (ajusta si tu ruta es otra)

const CrearActividad = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alumno, setAlumno] = useState("");
  const [fecha, setFecha] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // cuando el navegador vuelve en línea --> intentar enviar pendientes
    const onOnline = () => {
      setMsg("Conexión restaurada: sincronizando actividades pendientes...");
      flushPending();
    };
    window.addEventListener("online", onOnline);
    // si el SW soporta sync, notificamos al SW usando registerSync en el momento en que guardamos.
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const flushPending = async () => {
    const token = localStorage.getItem("token");
    const pendings = await getAllPendingActivities();
    for (const p of pendings) {
      try {
        const res = await fetch(`${API_POST}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(p.payload),
        });
        if (res.ok) {
          // quitar de la cola
          await removePendingActivity(p.id);
        } else {
          console.warn("No se pudo subir pendiente todavía:", await res.text());
        }
      } catch (err) {
        console.warn("Error enviando pendiente:", err);
        // si falla la red, salimos y esperamos al siguiente online / sync event
        return;
      }
    }
    setMsg("Pendientes sincronizados.");
  };

  const trySendNow = async (payload) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_POST}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return { ok: true, response: await res.json() };
      } else {
        const errBody = await res.json().catch(() => null);
        return { ok: false, error: errBody || res.statusText };
      }
    } catch (err) {
      return { ok: false, error: "network" };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!titulo || !alumno) return setMsg("Completa título y alumno.");

    const payload = { titulo, descripcion, alumno, fecha };

    // intenta enviar ahora
    const result = await trySendNow(payload);

    if (result.ok) {
      setMsg("Actividad creada y guardada en el servidor ✔");
      // opcional: navegar al dashboard
      setTimeout(() => navigate("/dashboard"), 900);
      return;
    }

    // si fallo por red o similar => guardar en IndexedDB como pendiente
    const pending = {
      payload,
      createdAt: new Date().toISOString(),
    };

    const id = await addPendingActivity(pending);

    // registrar sync si existe serviceWorker + SyncManager
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // etiqueta única, en caso de múltiples invocaciones se puede usar siempre el mismo tag
        await reg.sync.register("sync-actividades");
        setMsg("Sin conexión — actividad guardada en cola. Se enviará cuando haya Internet.");
      } catch (err) {
        console.warn("No se pudo registrar sync, queda en cola:", err);
        setMsg("Actividad guardada en cola local (no hay Background Sync).");
      }
    } else {
      setMsg("Actividad guardada en cola local (se subirá al recuperar conexión).");
    }

    // limpiar form
    setTitulo("");
    setDescripcion("");
    setAlumno("");
    setFecha("");
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Crear actividad</h1>
            <p style={styles.subtitle}>Si no hay Internet, la actividad se guardará y se subirá al volver a conectarte.</p>
          </div>
          <div>
            <button style={styles.btn} onClick={() => navigate("/actividades")}>Volver</button>
          </div>
        </header>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label>Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />

          <label>Alumno</label>
          <input value={alumno} onChange={(e) => setAlumno(e.target.value)} required />

          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

          <label>Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

          <div style={{ marginTop: 12 }}>
            <button type="submit" style={styles.primaryBtn}>Crear actividad</button>
          </div>
        </form>

        <p style={{ marginTop: 12, color: "#8fb" }}>{msg}</p>

        <div style={styles.pendingBox}>
          <h4>Actividades en cola (pendientes)</h4>
          <PendingList onFlush={() => { /* opcional */ }} />
        </div>
      </div>
    </div>
  );
};

// componente pequeño para listar pendientes locales
const PendingList = ({ onFlush }) => {
  const [list, setList] = React.useState([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const items = await getAllPendingActivities();
      if (mounted) setList(items);
    })();
    const interval = setInterval(async () => {
      const items = await getAllPendingActivities();
      if (mounted) setList(items);
    }, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!list.length) return <p style={{ color: "#cbd5f5" }}>No hay pendientes.</p>;

  return (
    <ul>
      {list.map((it) => (
        <li key={it.id} style={{ color: "#cbd5f5", marginBottom: 6 }}>
          {it.payload.titulo} — {new Date(it.createdAt).toLocaleString()}
        </li>
      ))}
    </ul>
  );
};

const styles = {
  wrapper: { minHeight: "100vh", padding: 20, background: "linear-gradient(#022, #000)" },
  container: { maxWidth: 800, margin: "0 auto", color: "#e5e7eb" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { margin: 0 },
  subtitle: { color: "#cbd5f5" },
  form: { display: "grid", gap: 8, marginTop: 12 },
  primaryBtn: { padding: "10px 14px", background: "#10b981", color: "#052023", border: "none", borderRadius: 8 },
  btn: { padding: "8px 12px", background: "#1f2937", color: "#fff", borderRadius: 8, border: "none" },
  pendingBox: { marginTop: 16, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8 },
};

export default CrearActividad;
