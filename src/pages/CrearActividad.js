import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { addPendingActivity, getAllPendingActivities, removePendingActivity } from "../utils/idb";

const API_POST = "https://pwa-horaxhora-backend.onrender.com/api/solicitudes";

const CrearActividad = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alumno, setAlumno] = useState("");
  const [fecha, setFecha] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onOnline = () => {
      setMsg("Conexión restaurada: sincronizando actividades pendientes...");
      flushPending();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const flushPending = async () => {
    const token = localStorage.getItem("token");
    const pendings = await getAllPendingActivities();
    let syncSuccessCount = 0;

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
          await removePendingActivity(p.id);
          console.log("[flushPending] enviado y removido id:", p.id);
          syncSuccessCount++;
        } else {
          if (res.status >= 400 && res.status < 500) {
            console.warn("[flushPending] server rejected pending (client error), removing:", p.id, res.status);
            await removePendingActivity(p.id);
          } else {
            console.warn("[flushPending] server error, dejar en cola para reintentar:", p.id, res.status);
          }
        }
      } catch (err) {
        console.warn("[flushPending] error de red al enviar pendiente, saliendo para reintentar luego:", err);
        return;
      }
    }
    
    setMsg("Pendientes sincronizados.");
    if (syncSuccessCount > 0) {
      console.log(`[flushPending] ${syncSuccessCount} actividades sincronizadas. Navegando para recargar datos.`);
      navigate("/dashboard", { replace: true }); 
      return; 
    }
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
        return { ok: false, error: errBody || res.statusText, status: res.status };
      }
    } catch (err) {
      return { ok: false, error: "network" };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!titulo || !alumno) return setMsg("Completa título y alumno.");

    const payload = { titulo, descripcion, alumno, fecha };

    
    const result = await trySendNow(payload);

    if (result.ok) {
      setMsg("Actividad creada y guardada en el servidor ✔");
    
      setTimeout(() => navigate("/dashboard", { replace: true }), 900);
      return;
    }

    
    const pending = {
      payload,
      createdAt: new Date().toISOString(),
    };

    try {
      const id = await addPendingActivity(pending);
      console.log("[handleSubmit] guardado en IDB id:", id);
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.sync.register("sync-actividades");
          setMsg("Sin conexión — actividad guardada en cola. Se enviará cuando haya Internet.");
        } catch (err) {
          console.warn("No se pudo registrar sync, queda en cola:", err);
          setMsg("Actividad guardada en cola local (no hay Background Sync).");
        }
      } else {
        setMsg("Actividad guardada en cola local (se subirá al recuperar conexión).");
      }
    } catch (err) {
      console.error("Error guardando en IDB:", err);
      setMsg("Error guardando localmente. Intenta de nuevo.");
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
          <PendingList onFlush={flushPending} /> 
        </div>
      </div>
    </div>
  );
};


const PendingList = ({ onFlush }) => {
  const [list, setList] = React.useState([]);
  const mountedRef = React.useRef(true);
  const safeItem = (it) => {
    if (!it || typeof it !== "object") return { id: null, payload: {}, createdAt: null };
    return {
      id: it.id ?? null,
      payload: it.payload && typeof it.payload === "object" ? it.payload : {},
      createdAt: it.createdAt ?? it.createdAtBackup ?? null,
    };
  };

  React.useEffect(() => {
    mountedRef.current = true;
    let stopped = false;

    const load = async () => {
      try {
        const items = await getAllPendingActivities();
        if (stopped || !mountedRef.current) return;
        const normalized = Array.isArray(items) ? items.map(safeItem) : [];
        setList(normalized);
      } catch (err) {
        console.error("Error leyendo pendientes desde IDB:", err);
        setList([]);
      }
    };

    load();
    const interval = setInterval(load, 3000);

    return () => {
      stopped = true;
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  if (!Array.isArray(list) || list.length === 0) {
    return <p style={{ color: "#cbd5f5" }}>No hay pendientes.</p>;
  }

  return (
    <div>
      <ul>
        {list.map((it) => {
          const item = safeItem(it);
          const title = item.payload?.titulo ?? item.payload?.title ?? "Sin título";
          let dateStr = "";
          try {
            dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
          } catch {
            dateStr = "";
          }
          return (
            <li key={item.id ?? Math.random()} style={{ color: "#cbd5f5", marginBottom: 6 }}>
              {title} {dateStr ? " — " + dateStr : ""}
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 8 }}>
        <button style={styles.btn} onClick={() => onFlush && onFlush()}>Intentar enviar ahora</button>
      </div>
    </div>
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

