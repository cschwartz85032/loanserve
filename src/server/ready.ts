let ready = false;

export function markReady() { 
  ready = true; 
}

export function markNotReady() { 
  ready = false; 
}

export function readyHandler(req: any, res: any) {
  res.status(ready ? 200 : 503).json({ ready });
}