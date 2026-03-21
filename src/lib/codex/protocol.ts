export type JsonRpcId = number | string;

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: TParams;
};

export type JsonRpcResponse<TResult = unknown> = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  result?: TResult;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type JsonRpcNotification<TParams = unknown> = {
  jsonrpc?: "2.0";
  method: string;
  params: TParams;
};

export function isJsonRpcResponse(
  value: unknown
): value is JsonRpcResponse<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    ("result" in value || "error" in value) &&
    !("method" in value)
  );
}

export function isJsonRpcServerRequest(
  value: unknown
): value is JsonRpcRequest<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "method" in value
  );
}

export function isJsonRpcNotification(
  value: unknown
): value is JsonRpcNotification<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !("id" in value) &&
    "method" in value
  );
}
