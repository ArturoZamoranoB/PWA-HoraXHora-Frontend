// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Actividades from "./pages/Actividades";
import Profile from "./pages/Profile";
import CrearActividad from "./pages/CrearActividad";

function App() {
  return (
    <Router>
      <Routes>
     
        <Route path="/" element={<Navigate to="/login" replace />} />

 
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/actividades" element={<Actividades />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/crear" element={<CrearActividad />} />

       
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
