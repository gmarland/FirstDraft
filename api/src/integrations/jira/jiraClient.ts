export type JiraIssueSummary = {
  id: string;
  key: string;
  summary: string;
  status: string;
  fields?: Record<string, unknown>;
};

export type JiraAttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  contentUrl: string;
};

export type JiraField = {
  id: string;
  key: string;
  name: string;
};

export type JiraTransition = {
  id: string;
  name: string;
  toStatusId: string;
  toStatus: string;
};

type JiraDocument = {
  type: "doc";
  version: 1;
  content: JiraDocumentBlock[];
};

type JiraDocumentBlock = {
  type: "paragraph";
  content?: JiraDocumentText[];
};

type JiraDocumentText = {
  type: "text";
  text: string;
};

export type JiraBoard = {
  id: number;
  name: string;
  type: string;
  filterId?: number;
};

export type JiraBoardStatus = {
  id: string;
  name: string;
  statusCategory: string;
};

type JiraClientOptions = {
  siteUrl: string;
  email: string;
  apiToken: string;
};

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  public constructor(options: JiraClientOptions) {
    this.baseUrl = normalizeSiteUrl(options.siteUrl);
    this.authorization = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`, "utf8").toString("base64")}`;
  }

  public async testConnection(): Promise<void> {
    await this.request<unknown>("/rest/api/3/myself");
  }

  public async listBoards(): Promise<JiraBoard[]> {
    const payload = await this.request<{ values?: JiraBoardResponse[] }>(
      "/rest/agile/1.0/board?maxResults=100",
    );

    const boards = await Promise.all(
      (payload.values ?? []).map(async (board) => {
        const filterId = await this.getBoardFilterId(board.id).catch(
          () => undefined,
        );
        return {
          id: board.id,
          name: board.name,
          type: board.type,
          filterId,
        };
      }),
    );

    return boards.sort((left, right) => left.name.localeCompare(right.name));
  }

  public async getBoardStatuses(boardId: number): Promise<JiraBoardStatus[]> {
    const configuration = await this.request<JiraBoardConfiguration>(
      `/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}/configuration`,
    );
    const statusIds = new Set<string>();

    for (const column of configuration.columnConfig?.columns ?? []) {
      for (const status of column.statuses ?? []) {
        if (status.id) statusIds.add(status.id);
      }
    }

    const statuses = await Promise.all(
      [...statusIds].map((statusId) =>
        this.getStatus(statusId).catch(() => undefined),
      ),
    );

    return statuses
      .filter((status): status is JiraBoardStatus => Boolean(status))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async getBoardFilterId(boardId: number): Promise<number | undefined> {
    const configuration = await this.request<JiraBoardConfiguration>(
      `/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}/configuration`,
    );
    return configuration.filter?.id;
  }

  public async getStatus(statusId: string): Promise<JiraBoardStatus> {
    const payload = await this.request<JiraStatusResponse>(
      `/rest/api/3/status/${encodeURIComponent(statusId)}`,
    );

    return {
      id: payload.id,
      name: payload.name,
      statusCategory: payload.statusCategory?.name ?? "",
    };
  }

  public async listFields(): Promise<JiraField[]> {
    const payload = await this.request<JiraFieldResponse[]>(
      "/rest/api/3/field",
    );

    return payload.map((field) => ({
      id: field.id,
      key: field.key ?? field.id,
      name: field.name ?? "",
    }));
  }

  public async findFields(nameOrKey: string): Promise<JiraField[]> {
    const normalizedNameOrKey = nameOrKey.trim().toLowerCase();
    if (!normalizedNameOrKey) return [];

    return (await this.listFields()).filter(
      (field) =>
        field.id.toLowerCase() === normalizedNameOrKey ||
        field.key.toLowerCase() === normalizedNameOrKey ||
        field.name.trim().toLowerCase() === normalizedNameOrKey,
    );
  }

  public async searchIssues(
    jql: string,
    maxResults = 1,
    fields: string[] = ["summary", "status"],
  ): Promise<JiraIssueSummary[]> {
    const payload = await this.request<{ issues?: JiraSearchIssue[] }>(
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: {
          jql,
          maxResults,
          fields,
        },
      },
    );

    console.log("Jira search payload", payload.issues);
    return (payload.issues ?? []).map((issue) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary ?? "",
      status: issue.fields?.status?.name ?? "",
      fields: issue.fields,
    }));
  }

  public async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const payload = await this.request<{
      transitions?: JiraTransitionResponse[];
    }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);

    return (payload.transitions ?? []).map((transition) => ({
      id: transition.id,
      name: transition.name,
      toStatusId: transition.to?.id ?? "",
      toStatus: transition.to?.name ?? "",
    }));
  }

  public async transitionIssue(
    issueKey: string,
    targetStatusId: string,
    targetStatusName: string,
  ): Promise<JiraTransition> {
    const transitions = await this.getTransitions(issueKey);
    const transition = findTransition(
      transitions,
      targetStatusId,
      targetStatusName,
    );
    if (!transition) {
      throw new Error(
        `No Jira transition is available for ${issueKey} to status ${targetStatusName || targetStatusId}`,
      );
    }

    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: "POST",
        body: {
          transition: {
            id: transition.id,
          },
        },
      },
    );

    return transition;
  }

  public async addComment(issueKey: string, body: string): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        method: "POST",
        body: {
          body: buildJiraDocument(body),
        },
      },
    );
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: this.authorization,
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      throw new Error(
        `Jira API returned ${response.status}: ${await readResponseMessage(response)}`,
      );
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

function findTransition(
  transitions: JiraTransition[],
  targetStatusId: string,
  targetStatusName: string,
): JiraTransition | undefined {
  const normalizedStatusId = targetStatusId.trim();
  if (normalizedStatusId) {
    const byStatusId = transitions.find(
      (transition) => transition.toStatusId === normalizedStatusId,
    );
    if (byStatusId) return byStatusId;
  }

  const normalizedStatusName = normalizeTransitionStatusName(targetStatusName);
  if (!normalizedStatusName) return undefined;

  return transitions.find(
    (transition) =>
      normalizeTransitionStatusName(transition.toStatus) ===
        normalizedStatusName ||
      normalizeTransitionStatusName(transition.name) === normalizedStatusName,
  );
}

function normalizeTransitionStatusName(value: string): string {
  return value.trim().toLowerCase();
}

function buildJiraDocument(text: string): JiraDocument {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content = lines.map((line): JiraDocumentBlock => {
    const cleanLine = line.trimEnd();
    return cleanLine
      ? {
          type: "paragraph",
          content: [{ type: "text", text: cleanLine }],
        }
      : { type: "paragraph" };
  });

  return {
    type: "doc",
    version: 1,
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

export function normalizeSiteUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function readResponseMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      errorMessages?: string[];
      message?: string;
      error?: string;
    };
    return (
      payload.errorMessages?.join("; ") ||
      payload.message ||
      payload.error ||
      response.statusText
    );
  } catch {
    return response.statusText;
  }
}

type JiraSearchIssue = {
  id: string;
  key: string;
  fields?: Record<string, unknown> & {
    summary?: string;
    status?: {
      name?: string;
    };
  };
};

type JiraBoardResponse = {
  id: number;
  name: string;
  type: string;
};

type JiraBoardConfiguration = {
  filter?: {
    id?: number;
  };
  columnConfig?: {
    columns?: Array<{
      statuses?: Array<{
        id?: string;
      }>;
    }>;
  };
};

type JiraStatusResponse = {
  id: string;
  name: string;
  statusCategory?: {
    name?: string;
  };
};

type JiraFieldResponse = {
  id: string;
  key?: string;
  name?: string;
};

type JiraTransitionResponse = {
  id: string;
  name: string;
  to?: {
    id?: string;
    name?: string;
  };
};
