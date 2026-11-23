import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/archivo/wdth.css';
import './styles/app.css';
import './styles/pages.css';
import './styles/match.css';
import { queryClient } from './lib/queries';
import { Empty, Toasts } from './components/ui';
import { AppShell } from './components/AppShell';
import { Landing } from './features/landing/Landing';
import { AuthPage } from './features/auth/AuthPage';
import { MainMenu } from './features/menu/MainMenu';
import { ProfilePage } from './features/profile/ProfilePage';
import { PhotosPage } from './features/photos/PhotosPage';
import { CharacterEditPage, CharactersPage } from './features/characters/CharactersPage';
import { CreateRoomPage, JoinRoomPage } from './features/rooms/RoomPages';
import { LobbyPage } from './features/lobby/LobbyPage';

function NotFound() {
  return (
    <main className="page page-narrow">
      <Empty title="Aquí no hay nada">
        <p>La página que buscas no existe o ha cambiado de sitio.</p>
        <Link className="btn" to="/">
          Ir al inicio
        </Link>
      </Empty>
    </main>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/entrar', element: <AuthPage mode="login" /> },
  { path: '/registro', element: <AuthPage mode="register" /> },
  {
    element: <AppShell />,
    children: [
      { path: '/menu', element: <MainMenu /> },
      { path: '/perfil', element: <ProfilePage /> },
      { path: '/fotos', element: <PhotosPage /> },
      { path: '/personajes', element: <CharactersPage /> },
      { path: '/personajes/:id', element: <CharacterEditPage /> },
      { path: '/salas/nueva', element: <CreateRoomPage /> },
      { path: '/unirse', element: <JoinRoomPage /> },
      { path: '/r/:code', element: <JoinRoomPage /> },
      { path: '/sala/:code', element: <LobbyPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toasts />
    </QueryClientProvider>
  </StrictMode>,
);
