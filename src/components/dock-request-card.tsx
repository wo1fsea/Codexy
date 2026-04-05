"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  DockSelect,
  type DockSelectOption
} from "@/components/dock-select";
import type { DockServerRequest } from "@/lib/codex/types";
import {
  getApprovePayload,
  getCommandApprovalCwd,
  getCommandApprovalText,
  getDeclinePayload,
  getFileApprovalReason,
  getFileApprovalTargets,
  getServerRequestFamily,
  getServerRequestTitle,
  getSingleApprovePayload,
  isCommandApprovalRequest,
  isFileApprovalRequest,
  isMcpElicitationRequest,
  isPermissionApprovalRequest,
  isUserInputRequest,
  type FileApprovalRequestEntry,
  type McpElicitationRequestEntry,
  type PermissionApprovalRequestEntry,
  type UserInputRequestEntry
} from "@/lib/codex/server-requests";
import { useI18n } from "@/lib/i18n/provider";
import type { TranslateFn } from "@/lib/i18n/messages";

export type RequestAnswerValue = string | number | boolean | string[] | null;
export type RequestAnswersState = Record<
  string,
  Record<string, RequestAnswerValue>
>;

type McpFormElicitationParams = Extract<
  McpElicitationRequestEntry["params"],
  { mode: "form" }
>;

type McpElicitationFieldSchema =
  McpFormElicitationParams["requestedSchema"]["properties"][string];

type DockRequestCardProps = {
  fallbackCwd: string;
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: DockServerRequest;
  requestAnswers: RequestAnswersState;
  setRequestAnswers: Dispatch<SetStateAction<RequestAnswersState>>;
};

function humanizeIdentifier(value: string) {
  const withSpaces = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withSpaces) {
    return value;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function RequestApprovalActions({
  isResolving,
  onAllowOnce,
  onAllowSession,
  onDeny
}: {
  isResolving: boolean;
  onAllowOnce: () => void;
  onAllowSession: () => void;
  onDeny: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="dock-request-actions">
      <button
        className="dock-request-action is-primary"
        disabled={isResolving}
        onClick={onAllowOnce}
        type="button"
      >
        {isResolving ? t("request.processing") : t("actions.allowOnce")}
      </button>
      <button
        className="dock-request-action"
        disabled={isResolving}
        onClick={onAllowSession}
        type="button"
      >
        {t("actions.allowForSession")}
      </button>
      <button
        className="dock-request-action is-muted"
        disabled={isResolving}
        onClick={onDeny}
        type="button"
      >
        {t("actions.deny")}
      </button>
    </div>
  );
}

function CommandApprovalRequestView({
  fallbackCwd,
  isResolving,
  onResolve,
  request
}: {
  fallbackCwd: string;
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: Extract<
    DockServerRequest,
    { method: "item/commandExecution/requestApproval" | "execCommandApproval" }
  >;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="dock-request-command-shell">
        <pre className="dock-request-command">
          {getCommandApprovalText(request) ?? t("request.commandNeedsApproval")}
        </pre>
      </div>
      <div className="dock-request-meta-row">
        <code>{getCommandApprovalCwd(request, fallbackCwd)}</code>
      </div>
      <RequestApprovalActions
        isResolving={isResolving}
        onAllowOnce={() => onResolve(getSingleApprovePayload(request.method))}
        onAllowSession={() => onResolve(getApprovePayload(request.method))}
        onDeny={() => onResolve(getDeclinePayload(request.method))}
      />
    </>
  );
}

function FileApprovalRequestView({
  isResolving,
  onResolve,
  request
}: {
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: FileApprovalRequestEntry;
}) {
  const reason = getFileApprovalReason(request);
  const targets = getFileApprovalTargets(request);

  return (
    <>
      {reason ? <p className="dock-request-copy">{reason}</p> : null}
      {targets.length ? <pre>{targets.join("\n")}</pre> : null}
      <RequestApprovalActions
        isResolving={isResolving}
        onAllowOnce={() => onResolve(getSingleApprovePayload(request.method))}
        onAllowSession={() => onResolve(getApprovePayload(request.method))}
        onDeny={() => onResolve(getDeclinePayload(request.method))}
      />
    </>
  );
}

function UserInputRequestView({
  isResolving,
  onResolve,
  request,
  requestAnswers,
  setRequestAnswers
}: {
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: UserInputRequestEntry;
  requestAnswers: RequestAnswersState;
  setRequestAnswers: Dispatch<SetStateAction<RequestAnswersState>>;
}) {
  const { t } = useI18n();

  return (
    <div className="dock-question-stack">
      {request.params.questions.map((question) => (
        <label className="dock-question" key={question.id}>
          <span>{question.question}</span>
          {question.options?.length ? (
            <DockSelect
              ariaLabel={question.header || question.question}
              className="dock-sidebar-select"
              onChange={(value) =>
                setRequestAnswers((current) => ({
                  ...current,
                  [request.requestId]: {
                    ...current[request.requestId],
                    [question.id]: value
                  }
                }))
              }
              options={[
                { value: "", label: t("request.select"), disabled: true },
                ...question.options.map(
                  (option): DockSelectOption => ({
                    value: option.label,
                    label: option.label,
                    description: option.description
                  })
                )
              ]}
              placeholder={t("request.select")}
              value={getTextRequestAnswer(
                requestAnswers,
                request.requestId,
                question.id
              )}
            />
          ) : (
            <input
              className="dock-sidebar-input"
              onChange={(event) =>
                setRequestAnswers((current) => ({
                  ...current,
                  [request.requestId]: {
                    ...current[request.requestId],
                    [question.id]: event.target.value
                  }
                }))
              }
              type={question.isSecret ? "password" : "text"}
              value={getTextRequestAnswer(
                requestAnswers,
                request.requestId,
                question.id
              )}
            />
          )}
        </label>
      ))}
      <button
        className="dock-ghost-action"
        disabled={isResolving}
        onClick={() =>
          onResolve({
            answers: Object.fromEntries(
              request.params.questions.map((question) => [
                question.id,
                {
                  answers: [
                    getTextRequestAnswer(
                      requestAnswers,
                      request.requestId,
                      question.id
                    )
                  ]
                }
              ])
            )
          })
        }
        type="button"
      >
        {isResolving ? t("request.processing") : t("actions.submitAnswers")}
      </button>
    </div>
  );
}

function getGrantedPermissionsFromRequest(
  request: PermissionApprovalRequestEntry
) {
  const grantedPermissions: Record<string, unknown> = {};

  if (request.params.permissions.network?.enabled) {
    grantedPermissions.network = {
      enabled: true
    };
  }

  const read = request.params.permissions.fileSystem?.read?.filter(Boolean) ?? [];
  const write = request.params.permissions.fileSystem?.write?.filter(Boolean) ?? [];

  if (read.length || write.length) {
    grantedPermissions.fileSystem = {
      ...(read.length ? { read } : {}),
      ...(write.length ? { write } : {})
    };
  }

  return grantedPermissions;
}

function getPermissionGrantPayload(
  request: PermissionApprovalRequestEntry,
  scope: "turn" | "session"
) {
  return {
    permissions: getGrantedPermissionsFromRequest(request),
    scope
  };
}

function getDeniedPermissionsPayload() {
  return {
    permissions: {},
    scope: "turn" as const
  };
}

function getPermissionRequestSections(
  request: PermissionApprovalRequestEntry,
  t: TranslateFn
) {
  const sections: Array<{
    label: string;
    lines?: string[];
    value?: string;
  }> = [];

  if (request.params.permissions.network?.enabled) {
    sections.push({
      label: t("request.networkAccess"),
      value: "true"
    });
  }

  const read = request.params.permissions.fileSystem?.read?.filter(Boolean) ?? [];
  if (read.length) {
    sections.push({
      label: t("request.readAccess"),
      lines: read
    });
  }

  const write = request.params.permissions.fileSystem?.write?.filter(Boolean) ?? [];
  if (write.length) {
    sections.push({
      label: t("request.writeAccess"),
      lines: write
    });
  }

  return sections;
}

function PermissionApprovalRequestView({
  isResolving,
  onResolve,
  request
}: {
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: PermissionApprovalRequestEntry;
}) {
  const { t } = useI18n();

  return (
    <>
      {request.params.reason ? (
        <p className="dock-request-copy">{request.params.reason}</p>
      ) : null}
      <div className="dock-question-stack">
        {getPermissionRequestSections(request, t).map((section) => (
          <div className="dock-question" key={section.label}>
            <span>{section.label}</span>
            {section.lines?.length ? (
              <div className="dock-request-command-shell">
                <pre className="dock-request-command">{section.lines.join("\n")}</pre>
              </div>
            ) : (
              <code>{section.value}</code>
            )}
          </div>
        ))}
      </div>
      <div className="dock-request-actions">
        <button
          className="dock-request-action is-primary"
          disabled={isResolving}
          onClick={() => onResolve(getPermissionGrantPayload(request, "turn"))}
          type="button"
        >
          {isResolving ? t("request.processing") : t("actions.allowOnce")}
        </button>
        <button
          className="dock-request-action"
          disabled={isResolving}
          onClick={() => onResolve(getPermissionGrantPayload(request, "session"))}
          type="button"
        >
          {t("actions.allowForSession")}
        </button>
        <button
          className="dock-request-action is-muted"
          disabled={isResolving}
          onClick={() => onResolve(getDeniedPermissionsPayload())}
          type="button"
        >
          {t("actions.deny")}
        </button>
      </div>
    </>
  );
}

function getStoredRequestAnswer(
  requestAnswers: RequestAnswersState,
  requestId: string,
  key: string
) {
  return requestAnswers[requestId]?.[key];
}

function getTextRequestAnswer(
  requestAnswers: RequestAnswersState,
  requestId: string,
  key: string
) {
  const value = getStoredRequestAnswer(requestAnswers, requestId, key);
  return typeof value === "string" ? value : "";
}

function getNumberRequestAnswer(
  requestAnswers: RequestAnswersState,
  requestId: string,
  key: string
) {
  const value = getStoredRequestAnswer(requestAnswers, requestId, key);
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function getBooleanRequestAnswer(
  requestAnswers: RequestAnswersState,
  requestId: string,
  key: string,
  fallback = false
) {
  const value = getStoredRequestAnswer(requestAnswers, requestId, key);
  return typeof value === "boolean" ? value : fallback;
}

function getMultiSelectRequestAnswer(
  requestAnswers: RequestAnswersState,
  requestId: string,
  key: string,
  fallback: string[] = []
) {
  const value = getStoredRequestAnswer(requestAnswers, requestId, key);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : fallback;
}

function getMcpFieldOptions(schema: McpElicitationFieldSchema) {
  if ("oneOf" in schema && Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((option: { const: string; title?: string }) => ({
      value: option.const,
      label: option.title || option.const
    }));
  }

  if ("enum" in schema && Array.isArray(schema.enum)) {
    return schema.enum.map((value: string, index: number) => ({
      value,
      label:
        "enumNames" in schema && Array.isArray(schema.enumNames)
          ? schema.enumNames[index] || value
          : value
    }));
  }

  if (
    "items" in schema &&
    schema.items &&
    "oneOf" in schema.items &&
    Array.isArray(schema.items.oneOf)
  ) {
    return schema.items.oneOf.map((option: { const: string; title?: string }) => ({
      value: option.const,
      label: option.title || option.const
    }));
  }

  if (
    "items" in schema &&
    schema.items &&
    "enum" in schema.items &&
    Array.isArray(schema.items.enum)
  ) {
    return schema.items.enum.map((value: string) => ({
      value,
      label: value
    }));
  }

  return [];
}

function getMcpSchemaDefaultValue(
  schema: McpElicitationFieldSchema
): RequestAnswerValue | undefined {
  if ("default" in schema) {
    return schema.default as RequestAnswerValue;
  }

  return undefined;
}

function normalizeMcpFieldValue(
  schema: McpElicitationFieldSchema,
  value: RequestAnswerValue | undefined,
  required: boolean
) {
  const resolvedValue =
    typeof value === "undefined" ? getMcpSchemaDefaultValue(schema) : value;

  switch (schema.type) {
    case "string":
      if (typeof resolvedValue === "string") {
        if (required) {
          return resolvedValue;
        }

        return resolvedValue.trim() ? resolvedValue : undefined;
      }

      return required ? "" : undefined;
    case "number":
    case "integer":
      return typeof resolvedValue === "number" && Number.isFinite(resolvedValue)
        ? resolvedValue
        : undefined;
    case "boolean":
      return typeof resolvedValue === "boolean"
        ? resolvedValue
        : required
          ? false
          : undefined;
    case "array":
      return Array.isArray(resolvedValue) && resolvedValue.length
        ? resolvedValue
        : required
          ? []
          : undefined;
  }
}

function isMcpFieldValid(
  propertyKey: string,
  requestAnswers: RequestAnswersState,
  requestId: string,
  requiredFields: string[],
  schema: McpElicitationFieldSchema
) {
  const normalized = normalizeMcpFieldValue(
    schema,
    getStoredRequestAnswer(requestAnswers, requestId, propertyKey),
    requiredFields.includes(propertyKey)
  );

  if (!requiredFields.includes(propertyKey)) {
    return true;
  }

  if (schema.type === "string") {
    return typeof normalized === "string" && normalized.trim().length > 0;
  }

  if (schema.type === "array") {
    return Array.isArray(normalized) && normalized.length > 0;
  }

  return typeof normalized !== "undefined";
}

function isMcpRequestSubmittable(
  request: McpElicitationRequestEntry,
  requestAnswers: RequestAnswersState
) {
  if (request.params.mode === "url") {
    return true;
  }

  const requiredFields = request.params.requestedSchema.required ?? [];
  return Object.entries(request.params.requestedSchema.properties).every(
    ([propertyKey, schema]) =>
      isMcpFieldValid(
        propertyKey,
        requestAnswers,
        request.requestId,
        requiredFields,
        schema
      )
  );
}

function buildMcpElicitationPayload(
  request: McpElicitationRequestEntry,
  requestAnswers: RequestAnswersState
) {
  if (request.params.mode === "url") {
    return {
      action: "accept" as const,
      content: null,
      _meta: null
    };
  }

  const requiredFields = request.params.requestedSchema.required ?? [];
  const content = Object.fromEntries(
    Object.entries(request.params.requestedSchema.properties)
      .map(([propertyKey, schema]) => [
        propertyKey,
        normalizeMcpFieldValue(
          schema,
          getStoredRequestAnswer(requestAnswers, request.requestId, propertyKey),
          requiredFields.includes(propertyKey)
        )
      ])
      .filter(([, value]) => typeof value !== "undefined")
  );

  return {
    action: "accept" as const,
    content,
    _meta: null
  };
}

function McpElicitationRequestView({
  isResolving,
  onResolve,
  request,
  requestAnswers,
  setRequestAnswers
}: {
  isResolving: boolean;
  onResolve: (payload: Record<string, unknown>) => void;
  request: McpElicitationRequestEntry;
  requestAnswers: RequestAnswersState;
  setRequestAnswers: Dispatch<SetStateAction<RequestAnswersState>>;
}) {
  const { t } = useI18n();

  return (
    <div className="dock-question-stack">
      <p className="dock-request-copy">{request.params.message}</p>
      <div className="dock-request-meta-row">
        <span className="dock-request-meta-label">{t("request.serverName")}</span>
        <code>{request.params.serverName}</code>
      </div>

      {request.params.mode === "url" ? (
        <>
          <a
            className="dock-ghost-action"
            href={request.params.url}
            rel="noreferrer"
            target="_blank"
          >
            {t("actions.openLink")}
          </a>
          <div className="dock-request-actions">
            <button
              className="dock-request-action is-primary"
              disabled={isResolving}
              onClick={() => onResolve(buildMcpElicitationPayload(request, requestAnswers))}
              type="button"
            >
              {isResolving ? t("request.processing") : t("actions.confirm")}
            </button>
            <button
              className="dock-request-action"
              disabled={isResolving}
              onClick={() =>
                onResolve({
                  action: "decline",
                  content: null,
                  _meta: null
                })
              }
              type="button"
            >
              {t("actions.deny")}
            </button>
            <button
              className="dock-request-action is-muted"
              disabled={isResolving}
              onClick={() =>
                onResolve({
                  action: "cancel",
                  content: null,
                  _meta: null
                })
              }
              type="button"
            >
              {t("actions.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          {(() => {
            const formParams = request.params as McpFormElicitationParams;

            return Object.entries(formParams.requestedSchema.properties).map(
              ([propertyKey, schema]) => {
                const optionEntries = getMcpFieldOptions(schema);
                const required =
                  formParams.requestedSchema.required?.includes(propertyKey) ?? false;

                if (schema.type === "boolean") {
                  return (
                    <label className="dock-question" key={propertyKey}>
                      <span>
                        {schema.title || humanizeIdentifier(propertyKey)}
                        {required ? " *" : ""}
                      </span>
                      {schema.description ? <span>{schema.description}</span> : null}
                      <label>
                        <input
                          checked={getBooleanRequestAnswer(
                            requestAnswers,
                            request.requestId,
                            propertyKey,
                            schema.default ?? false
                          )}
                          onChange={(event) =>
                            setRequestAnswers((current) => ({
                              ...current,
                              [request.requestId]: {
                                ...current[request.requestId],
                                [propertyKey]: event.target.checked
                              }
                            }))
                          }
                          type="checkbox"
                        />
                        {" "}
                        {schema.title || humanizeIdentifier(propertyKey)}
                      </label>
                    </label>
                  );
                }

                if (schema.type === "array") {
                  const selectedValues = getMultiSelectRequestAnswer(
                    requestAnswers,
                    request.requestId,
                    propertyKey,
                    schema.default ?? []
                  );

                  return (
                    <div className="dock-question" key={propertyKey}>
                      <span>
                        {schema.title || humanizeIdentifier(propertyKey)}
                        {required ? " *" : ""}
                      </span>
                      {schema.description ? <span>{schema.description}</span> : null}
                      <div className="dock-question-stack">
                        {optionEntries.map((option) => {
                          const checked = selectedValues.includes(option.value);

                          return (
                            <label key={option.value}>
                              <input
                                checked={checked}
                                onChange={(event) =>
                                  setRequestAnswers((current) => {
                                    const currentValues = getMultiSelectRequestAnswer(
                                      current,
                                      request.requestId,
                                      propertyKey,
                                      schema.default ?? []
                                    );

                                    return {
                                      ...current,
                                      [request.requestId]: {
                                        ...current[request.requestId],
                                        [propertyKey]: event.target.checked
                                          ? [...currentValues, option.value]
                                          : currentValues.filter(
                                              (entry) => entry !== option.value
                                            )
                                      }
                                    };
                                  })
                                }
                                type="checkbox"
                              />
                              {" "}
                              {option.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (optionEntries.length) {
                  return (
                    <label className="dock-question" key={propertyKey}>
                      <span>
                        {schema.title || humanizeIdentifier(propertyKey)}
                        {required ? " *" : ""}
                      </span>
                      {schema.description ? <span>{schema.description}</span> : null}
                      <DockSelect
                        ariaLabel={schema.title || propertyKey}
                        className="dock-sidebar-select"
                        onChange={(value) =>
                          setRequestAnswers((current) => ({
                            ...current,
                            [request.requestId]: {
                              ...current[request.requestId],
                              [propertyKey]: value
                            }
                          }))
                        }
                        options={[
                          { value: "", label: t("request.select"), disabled: true },
                          ...optionEntries
                        ]}
                        placeholder={t("request.select")}
                        value={getTextRequestAnswer(
                          requestAnswers,
                          request.requestId,
                          propertyKey
                        )}
                      />
                    </label>
                  );
                }

                if (schema.type === "number" || schema.type === "integer") {
                  return (
                    <label className="dock-question" key={propertyKey}>
                      <span>
                        {schema.title || humanizeIdentifier(propertyKey)}
                        {required ? " *" : ""}
                      </span>
                      {schema.description ? <span>{schema.description}</span> : null}
                      <input
                        className="dock-sidebar-input"
                        max={schema.maximum}
                        min={schema.minimum}
                        onChange={(event) =>
                          setRequestAnswers((current) => ({
                            ...current,
                            [request.requestId]: {
                              ...current[request.requestId],
                              [propertyKey]:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value)
                            }
                          }))
                        }
                        type="number"
                        value={getNumberRequestAnswer(
                          requestAnswers,
                          request.requestId,
                          propertyKey
                        )}
                      />
                    </label>
                  );
                }

                if (schema.type === "string") {
                  return (
                    <label className="dock-question" key={propertyKey}>
                      <span>
                        {schema.title || humanizeIdentifier(propertyKey)}
                        {required ? " *" : ""}
                      </span>
                      {schema.description ? <span>{schema.description}</span> : null}
                      <input
                        className="dock-sidebar-input"
                        maxLength={schema.maxLength}
                        minLength={schema.minLength}
                        onChange={(event) =>
                          setRequestAnswers((current) => ({
                            ...current,
                            [request.requestId]: {
                              ...current[request.requestId],
                              [propertyKey]: event.target.value
                            }
                          }))
                        }
                        type="text"
                        value={getTextRequestAnswer(
                          requestAnswers,
                          request.requestId,
                          propertyKey
                        )}
                      />
                    </label>
                  );
                }

                return null;
              }
            );
          })()}
          <div className="dock-request-actions">
            <button
              className="dock-request-action is-primary"
              disabled={isResolving || !isMcpRequestSubmittable(request, requestAnswers)}
              onClick={() => onResolve(buildMcpElicitationPayload(request, requestAnswers))}
              type="button"
            >
              {isResolving ? t("request.processing") : t("actions.submitAnswers")}
            </button>
            <button
              className="dock-request-action"
              disabled={isResolving}
              onClick={() =>
                onResolve({
                  action: "decline",
                  content: null,
                  _meta: null
                })
              }
              type="button"
            >
              {t("actions.deny")}
            </button>
            <button
              className="dock-request-action is-muted"
              disabled={isResolving}
              onClick={() =>
                onResolve({
                  action: "cancel",
                  content: null,
                  _meta: null
                })
              }
              type="button"
            >
              {t("actions.cancel")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function DockRequestCard({
  fallbackCwd,
  isResolving,
  onResolve,
  request,
  requestAnswers,
  setRequestAnswers
}: DockRequestCardProps) {
  const { t } = useI18n();
  const family = getServerRequestFamily(request.method);

  let body: React.ReactNode = null;

  switch (family) {
    case "commandApproval":
      if (isCommandApprovalRequest(request)) {
        body = (
          <CommandApprovalRequestView
            fallbackCwd={fallbackCwd}
            isResolving={isResolving}
            onResolve={onResolve}
            request={request}
          />
        );
      }
      break;
    case "fileApproval":
      if (isFileApprovalRequest(request)) {
        body = (
          <FileApprovalRequestView
            isResolving={isResolving}
            onResolve={onResolve}
            request={request}
          />
        );
      }
      break;
    case "userInput":
      if (isUserInputRequest(request)) {
        body = (
          <UserInputRequestView
            isResolving={isResolving}
            onResolve={onResolve}
            request={request}
            requestAnswers={requestAnswers}
            setRequestAnswers={setRequestAnswers}
          />
        );
      }
      break;
    case "permissionsApproval":
      if (isPermissionApprovalRequest(request)) {
        body = (
          <PermissionApprovalRequestView
            isResolving={isResolving}
            onResolve={onResolve}
            request={request}
          />
        );
      }
      break;
    case "mcpElicitation":
      if (isMcpElicitationRequest(request)) {
        body = (
          <McpElicitationRequestView
            isResolving={isResolving}
            onResolve={onResolve}
            request={request}
            requestAnswers={requestAnswers}
            setRequestAnswers={setRequestAnswers}
          />
        );
      }
      break;
    default:
      body = null;
  }

  return (
    <div className="dock-request-card" key={request.requestId}>
      <div className="dock-request-head">
        <div className="dock-request-heading">
          <strong>{getServerRequestTitle(request.method, t)}</strong>
        </div>
      </div>
      {body}
    </div>
  );
}
