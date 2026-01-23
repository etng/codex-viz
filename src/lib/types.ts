export type DailyAgg = {
  sessions: number;
  messages: number;
  toolCalls: number;
  errors: number;
};

export type SessionSummary = {
  id: string;
  file: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  cwd: string | null;
  originator: string | null;
  cliVersion: string | null;
  messages: number;
  toolCalls: number;
  errors: number;
};

export type IndexSnapshot = {
  version: number;
  generatedAt: string;
  sessionsDir: string;
  cacheDir: string;
  totals: {
    files: number;
    sessions: number;
    messages: number;
    toolCalls: number;
    errors: number;
  };
  tools: Record<string, number>;
  daily: Record<string, DailyAgg>;
};

export type SessionsListResponse = {
  generatedAt: string;
  total: number;
  items: SessionSummary[];
};

export type TimelineEvent = {
  ts: string;
  kind: "user" | "assistant" | "tool_call" | "tool_output" | "error" | "other";
  name?: string;
  text?: string;
};

export type SessionTimelineResponse = {
  summary: SessionSummary;
  truncated: boolean;
  events: TimelineEvent[];
};
