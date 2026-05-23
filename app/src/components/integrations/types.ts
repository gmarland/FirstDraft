import type { JiraIntegrationSettings } from "../../types/api";

export type JiraFormState = JiraIntegrationSettings & {
  apiToken: string;
};
