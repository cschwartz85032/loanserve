import { allocateStandard, AllocationInput, AllocationResult } from "../servicing/allocation";

let externalAlloc: ((i:AllocationInput)=>Promise<AllocationResult>|AllocationResult)|null = null;

export function registerExternalAllocator(fn: (i:AllocationInput)=>Promise<AllocationResult>|AllocationResult){
  externalAlloc = fn;
}

export async function allocatePayment(i:AllocationInput): Promise<AllocationResult> {
  try {
    if (externalAlloc) return await externalAlloc(i);
  } catch (error) {
    console.warn('External allocator failed, falling back to standard:', error);
  }
  return allocateStandard(i);
}