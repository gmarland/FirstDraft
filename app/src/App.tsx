import { Box } from "@mui/material";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { WorkerDetailPage } from "./routes/WorkerDetailPage";
import { WorkersPage } from "./routes/WorkersPage";
import { CreateUserPage } from "./routes/CreateUserPage";
import { LoginPage } from "./routes/LoginPage";
import { ProfilePage } from "./routes/ProfilePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute />}>
          <Route index element={<LoginRoute />} />
        </Route>
        <Route path="/create-user" element={<PublicRoute />}>
          <Route index element={<CreateUserRoute />} />
        </Route>
        <Route path="/" element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/workers" replace />} />
            <Route path="workers" element={<WorkersRoute />} />
            <Route path="workers/:workerId" element={<WorkerRoute />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/workers" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedRoute() {
  const auth = useAuth();

  if (!auth.ready) {
    return <BootScreen />;
  }

  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PublicRoute() {
  const auth = useAuth();

  if (!auth.ready) {
    return <BootScreen />;
  }

  if (auth.token) {
    return <Navigate to="/workers" replace />;
  }

  return <Outlet />;
}

function LoginRoute() {
  const navigate = useNavigate();

  return (
    <LoginPage
      onCreateUser={() => navigate("/create-user")}
      onLoggedIn={() => navigate("/workers", { replace: true })}
    />
  );
}

function CreateUserRoute() {
  const navigate = useNavigate();

  return (
    <CreateUserPage
      onBackToLogin={() => navigate("/login")}
      onCreated={() => navigate("/workers", { replace: true })}
    />
  );
}

function WorkersRoute() {
  const navigate = useNavigate();

  return <WorkersPage navigate={navigate} />;
}

function WorkerRoute() {
  const { workerId } = useParams();
  const navigate = useNavigate();

  if (!workerId) {
    return <Navigate to="/workers" replace />;
  }

  return (
    <WorkerDetailPage
      workerId={workerId}
      onBackToWorkers={() => navigate("/workers")}
    />
  );
}

function BootScreen() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "text.secondary" }}>
      Loading FirstDraft console...
    </Box>
  );
}
