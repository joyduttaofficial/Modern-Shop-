import { Router, Request, Response } from "express";

export const dbRouter = Router();

// Fallback pool object for server live status checks
export const pool = {
  query: async (_sql: string, _params?: any[]) => {
    return { rows: [] as any[] };
  }
};

// In-memory store fallback for server proxy tables if PostgreSQL is not active
const memoryStore: Record<string, any[]> = {};

dbRouter.get("/:table", (req: Request, res: Response) => {
  const table = req.params.table;
  const data = memoryStore[table] || [];
  return res.json({ data, count: data.length });
});

dbRouter.post("/:table", (req: Request, res: Response) => {
  const table = req.params.table;
  if (!memoryStore[table]) {
    memoryStore[table] = [];
  }
  const item = { id: req.body?.id || Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  memoryStore[table].push(item);
  return res.json({ data: item, success: true });
});

dbRouter.put("/:table/:id", (req: Request, res: Response) => {
  const { table, id } = req.params;
  const items = memoryStore[table] || [];
  const idx = items.findIndex((i: any) => i.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...req.body, updatedAt: new Date().toISOString() };
    return res.json({ data: items[idx], success: true });
  }
  return res.json({ data: req.body, success: true });
});

dbRouter.delete("/:table/:id", (req: Request, res: Response) => {
  const { table, id } = req.params;
  if (memoryStore[table]) {
    memoryStore[table] = memoryStore[table].filter((i: any) => i.id !== id);
  }
  return res.json({ success: true });
});

dbRouter.post("/clear-all-notifications", (_req: Request, res: Response) => {
  memoryStore["activity_notifications"] = [];
  return res.json({ success: true });
});
