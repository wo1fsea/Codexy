import { getCodexBridge } from "@/lib/codex/bridge";
import type { RuntimeAdapter } from "@/lib/runtime/contracts";

class CodexRuntimeAdapter implements RuntimeAdapter {
  readonly id = "codex" as const;

  private get bridge() {
    return getCodexBridge();
  }

  ensureConnected() {
    return this.bridge.ensureConnected();
  }

  getState() {
    return this.bridge.getState();
  }

  getEndpointUrl() {
    return this.bridge.getEndpointUrl();
  }

  getPendingServerRequests(threadId?: string) {
    return this.bridge.getPendingServerRequests(threadId);
  }

  subscribe(listener: Parameters<RuntimeAdapter["subscribe"]>[0]) {
    return this.bridge.subscribe(listener);
  }

  listThreads(input: Parameters<RuntimeAdapter["listThreads"]>[0]) {
    return this.bridge.listThreads(input);
  }

  readThread(threadId: string) {
    return this.bridge.readThread(threadId);
  }

  listModels() {
    return this.bridge.listModels();
  }

  createThread(input: Parameters<RuntimeAdapter["createThread"]>[0]) {
    return this.bridge.createThread(input);
  }

  appendTurn(input: Parameters<RuntimeAdapter["appendTurn"]>[0]) {
    return this.bridge.appendTurn(input);
  }

  primeThread(threadId: string) {
    return this.bridge.primeThread(threadId);
  }

  renameThread(threadId: string, name: string) {
    return this.bridge.renameThread(threadId, name);
  }

  archiveThread(threadId: string) {
    return this.bridge.archiveThread(threadId);
  }

  unarchiveThread(threadId: string) {
    return this.bridge.unarchiveThread(threadId);
  }

  interruptTurn(threadId: string, turnId: string) {
    return this.bridge.interruptTurn(threadId, turnId);
  }

  steerTurn(input: Parameters<RuntimeAdapter["steerTurn"]>[0]) {
    return this.bridge.steerTurn(input);
  }

  forkThread(input: Parameters<RuntimeAdapter["forkThread"]>[0]) {
    return this.bridge.forkThread(input);
  }

  rollbackThread(
    threadId: string,
    numTurns: number
  ) {
    return this.bridge.rollbackThread(threadId, numTurns);
  }

  compactThread(threadId: string) {
    return this.bridge.compactThread(threadId);
  }

  runThreadShellCommand(
    input: Parameters<RuntimeAdapter["runThreadShellCommand"]>[0]
  ) {
    return this.bridge.runThreadShellCommand(input);
  }

  startReview(input: Parameters<RuntimeAdapter["startReview"]>[0]) {
    return this.bridge.startReview(input);
  }

  resolveServerRequest(
    requestId: string,
    payload: Parameters<RuntimeAdapter["resolveServerRequest"]>[1],
    fallback?: Parameters<RuntimeAdapter["resolveServerRequest"]>[2]
  ) {
    return this.bridge.resolveServerRequest(requestId, payload, fallback);
  }
}

const codexRuntimeAdapter = new CodexRuntimeAdapter();

export function getCodexRuntimeAdapter() {
  return codexRuntimeAdapter;
}
