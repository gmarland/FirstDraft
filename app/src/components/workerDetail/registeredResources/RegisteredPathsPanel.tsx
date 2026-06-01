import { Typography } from "@mui/material";
import { RegisteredResourceItem } from "./RegisteredResourceItem";
import { RegisteredResourcePanel } from "./RegisteredResourcePanel";

type Props = {
  paths: string[];
};

export function RegisteredPathsPanel({ paths }: Props) {
  return (
    <RegisteredResourcePanel
      caption="Paths"
      empty={paths.length === 0}
      emptyMessage="No paths reported by this worker."
    >
      {paths.map((path) => (
        <RegisteredResourceItem key={path}>
          <Typography component="code" className="wrap-code">
            {path}
          </Typography>
        </RegisteredResourceItem>
      ))}
    </RegisteredResourcePanel>
  );
}
