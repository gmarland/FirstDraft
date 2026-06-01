import { Box, Typography } from "@mui/material";

type Props = {
  label?: string;
  value: string;
  code?: boolean;
};

export function ResourceField({ label, value, code = false }: Props) {
  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      )}
      <Typography
        component={code ? "code" : "div"}
        className={code ? "wrap-code" : undefined}
        sx={{ fontWeight: code ? 400 : 700 }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}
