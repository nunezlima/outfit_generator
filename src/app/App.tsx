import { ChartColumn, LayoutGrid, Shirt, Sparkles, WashingMachine } from 'lucide-react';
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDB } from '../data/db';
import { configProblem } from '../lib/supabase';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { ConfigErrorScreen } from '../screens/ConfigErrorScreen';
import { GarmentDetailScreen } from '../screens/GarmentDetailScreen';
import { GarmentFormScreen } from '../screens/GarmentFormScreen';
import { GenerateScreen } from '../screens/GenerateScreen';
import { LaundryScreen } from '../screens/LaundryScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { OutfitDetailScreen } from '../screens/OutfitDetailScreen';
import { OutfitsScreen } from '../screens/OutfitsScreen';
import { RulesScreen } from '../screens/RulesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WardrobeScreen } from '../screens/WardrobeScreen';
import { CatalogProvider } from '../ui/CatalogContext';
import { Loading } from '../ui/common';
import { FeedbackProvider } from '../ui/feedback';
import { useWardrobeAnalysis } from './analysisHook';
import { AuthProvider, useAuth } from './auth';
import { GeneratorProvider } from './generatorState';
import { UpdatePrompt } from './UpdatePrompt';

export function App() {
  if (configProblem) return <ConfigErrorScreen problem={configProblem} />;
  return (
    <FeedbackProvider>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </FeedbackProvider>
  );
}

function Gate() {
  const { state } = useAuth();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signedOut') return <LoginScreen />;
  // key: al cambiar de usuario se reinicia todo el árbol (y su base local).
  return (
    <CatalogProvider key={state.userId}>
      <GeneratorProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<GenerateScreen />} />
            <Route path="guardarropa" element={<WardrobeScreen />} />
            <Route path="guardarropa/nueva" element={<GarmentFormScreen />} />
            <Route path="guardarropa/:id" element={<GarmentDetailScreen />} />
            <Route path="guardarropa/:id/editar" element={<GarmentFormScreen />} />
            <Route path="outfits" element={<OutfitsScreen />} />
            <Route path="outfits/:id" element={<OutfitDetailScreen />} />
            <Route path="cesto" element={<LaundryScreen />} />
            <Route path="analisis" element={<AnalysisScreen />} />
            <Route path="ajustes" element={<SettingsScreen />} />
            <Route path="ajustes/categorias" element={<CategoriesScreen />} />
            <Route path="ajustes/reglas" element={<RulesScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </GeneratorProvider>
    </CatalogProvider>
  );
}

function Layout() {
  const laundry = useLiveQuery(() => getDB().garments.where('status').equals('laundry').count(), []) ?? 0;
  const { summaryPending } = useWardrobeAnalysis();
  return (
    <div className="app">
      <UpdatePrompt />
      <Outlet />
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavLink to="/" end>
          <Sparkles />
          Generar
        </NavLink>
        <NavLink to="/guardarropa">
          <Shirt />
          Guardarropa
        </NavLink>
        <NavLink to="/outfits">
          <LayoutGrid />
          Outfits
        </NavLink>
        <NavLink to="/cesto">
          <WashingMachine />
          Cesto
          {laundry > 0 && <span className="nav-count">{laundry > 99 ? '99+' : laundry}</span>}
        </NavLink>
        <NavLink to="/analisis">
          <ChartColumn />
          Análisis
          {summaryPending && <span className="nav-dot" aria-label="Resumen nuevo" />}
        </NavLink>
      </nav>
    </div>
  );
}
