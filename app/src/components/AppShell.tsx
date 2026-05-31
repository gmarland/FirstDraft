import {
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import AppsIcon from "@mui/icons-material/Apps";
import HubIcon from "@mui/icons-material/Hub";
import LogoutIcon from "@mui/icons-material/Logout";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const workersActive =
    location.pathname === "/workers" ||
    location.pathname.startsWith("/workers/");
  const profileActive = location.pathname === "/profile";
  const drawerWidth = 260;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            bgcolor: "#142126",
            color: "#ecf2f4",
            borderRight: 0,
            p: 2,
          },
        }}
      >
        <Button
          onClick={() => navigate("/workers")}
          startIcon={<HubIcon />}
          sx={{
            justifyContent: "flex-start",
            color: "inherit",
            fontSize: 20,
            fontWeight: 800,
            mb: 2,
          }}
        >
          FirstDraft
        </Button>

        <List dense>
          <ListItemButton
            selected={workersActive}
            onClick={() => navigate("/workers")}
            sx={navSx}
          >
            <ListItemIcon sx={iconSx}>
              <AppsIcon />
            </ListItemIcon>
            <ListItemText primary="Workers" />
          </ListItemButton>
        </List>

        <Box sx={{ flexGrow: 1 }} />
        <Stack spacing={1.5}>
          <ListItemButton
            selected={profileActive}
            onClick={() => navigate("/profile")}
            sx={{
              border: "1px solid #2b4148",
              bgcolor: "#192a30",
              borderRadius: 1,
              p: 1.5,
              display: "block",
              color: "inherit",
              "&.Mui-selected, &.Mui-selected:hover, &:hover": {
                bgcolor: "#213238",
              },
            }}
          >
            <Typography sx={{ fontWeight: 800 }} className="wrap-code">
              {user?.name || user?.email}
            </Typography>
            <Typography variant="body2" sx={{ color: "#9fb0b7" }}>
              {user?.name ? user.email : user?.role}
            </Typography>
          </ListItemButton>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box component="main" sx={{ p: { xs: 2, md: 3.5 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

const navSx = {
  borderRadius: 1,
  color: "#b8c5ca",
  mb: 0.5,
  "&.Mui-selected, &.Mui-selected:hover, &:hover": {
    bgcolor: "#213238",
    color: "#ffffff",
  },
};

const iconSx = {
  color: "inherit",
  minWidth: 34,
};
