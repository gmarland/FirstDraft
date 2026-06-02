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
import { LandingPage } from "./routes/LandingPage";
import { LoginPage } from "./routes/LoginPage";
import { ProfilePage } from "./routes/ProfilePage";
import { TaskQueuePage } from "./routes/TaskQueuePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/login" element={<PublicRoute />}>
          <Route index element={<LoginRoute />} />
        </Route>
        <Route path="/create-user" element={<PublicRoute />}>
          <Route index element={<CreateUserRoute />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="workers" element={<WorkersRoute />} />
            <Route path="workers/:workerId" element={<WorkerRoute />} />
            <Route path="task-queue" element={<TaskQueuePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<FallbackRoute />} />
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

function LandingRoute() {
  const auth = useAuth();
  const navigate = useNavigate();

  if (!auth.ready) {
    return <BootScreen />;
  }

  if (auth.token) {
    return <Navigate to="/workers" replace />;
  }

  return (
    <LandingPage
      onLogin={() => navigate("/login")}
      onCreateUser={() => navigate("/create-user")}
    />
  );
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

function FallbackRoute() {
  const auth = useAuth();

  if (!auth.ready) {
    return <BootScreen />;
  }

  return <Navigate to={auth.token ? "/workers" : "/"} replace />;
}

function BootScreen() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "text.secondary" }}>
      Loading FirstDraft console...
    </Box>
  );
}
