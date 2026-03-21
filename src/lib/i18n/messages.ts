export type DockLocale = "en" | "zh-CN" | "ja" | "es" | "fr";

export const DEFAULT_LOCALE: DockLocale = "en";
export const LOCALE_STORAGE_KEY = "codex-dock.locale";

export const LOCALE_OPTIONS = [
  { value: "en", nativeLabel: "English" },
  { value: "zh-CN", nativeLabel: "简体中文" },
  { value: "ja", nativeLabel: "日本語" },
  { value: "es", nativeLabel: "Español" },
  { value: "fr", nativeLabel: "Français" }
] as const satisfies ReadonlyArray<{
  value: DockLocale;
  nativeLabel: string;
}>;

const en = {
  "language.label": "Language",
  "nav.newThread": "New thread",
  "nav.automation": "Automation",
  "nav.skills": "Skills",
  "sidebar.threads": "Threads",
  "sidebar.allProjects": "All projects",
  "sidebar.archived": "Archived",
  "sidebar.searchPlaceholder": "Search threads or projects",
  "sidebar.noThreads": "No matching threads",
  "filters.live": "Live",
  "filters.archived": "Archived",
  "filters.all": "All",
  "filters.allProjects": "All projects",
  "aria.threadArchiveFilter": "Thread archive filter",
  "aria.projectFilter": "Project filter",
  "aria.modelSelection": "Model selection",
  "aria.reasoningEffort": "Thinking level",
  "aria.approvalPolicy": "Approval policy",
  "aria.jumpToBottom": "Jump to bottom",
  "aria.language": "Language",
  "thread.untitled": "Untitled thread",
  "thread.new": "New thread",
  "stage.readyToBuild": "Ready to build in {workspace}",
  "stage.startBuilding": "Start building",
  "stage.loadingThread": "Loading thread...",
  "stage.threadTitlePlaceholder": "Thread title",
  "actions.saveTitle": "Save title",
  "actions.cancel": "Cancel",
  "actions.remove": "Remove",
  "actions.send": "Send",
  "actions.jumpToBottom": "Jump to bottom",
  "actions.takeoverAndContinue": "Take over and continue",
  "actions.allowOnce": "Allow once",
  "actions.allowForSession": "Allow for session",
  "actions.deny": "Deny",
  "actions.submitAnswers": "Submit answers",
  "actions.close": "Close",
  "actions.uploadImage": "Upload image",
  "actions.stop": "Stop",
  "thinking.label": "Thinking",
  "takeover.detectedTitle": "This thread is active somewhere else.",
  "takeover.detectedBody":
    "Confirm to take over from the web and continue this session.",
  "takeover.notice":
    "This thread is active. Your next send will take over this session.",
  "composer.placeholder":
    "Continue this thread, or start a new thread here...",
  "status.local": "Local",
  "status.tailnet": "Tailnet",
  "status.active": "active",
  "status.idle": "idle",
  "status.notLoaded": "notLoaded",
  "status.systemError": "system error",
  "status.commandFailed": "Failed",
  "status.commandInterrupted": "Interrupted",
  "status.commandRunning": "Running",
  "status.commandRan": "Ran",
  "status.fileEdited": "Edited",
  "status.fileAdded": "Added",
  "status.fileDeleted": "Deleted",
  "status.fileRenamed": "Renamed",
  "policies.on-request": "Default approval",
  "policies.untrusted": "Full access",
  "policies.on-failure": "Ask on failure",
  "policies.never": "Never ask",
  "request.commandApproval": "Command approval",
  "request.fileApproval": "File change approval",
  "request.confirmationRequired": "Confirmation required to continue",
  "request.workingDirectory": "Working directory",
  "request.commandNeedsApproval":
    "Approval is required before running this command.",
  "request.fileNeedsApproval":
    "Confirmation is required before writing files.",
  "request.select": "Select",
  "request.processing": "Working...",
  "notice.bridgeDisconnected": "Codex bridge disconnected. Reconnecting...",
  "notice.liveReconnect": "Live stream reconnecting...",
  "error.failedLoadThread": "Failed to load thread",
  "error.initializationFailed": "Initialization failed",
  "error.refreshThreadsFailed": "Failed to refresh threads",
  "error.sendFailed": "Failed to send",
  "error.uploadFailed": "Failed to upload",
  "error.requestFailed": "Failed to submit approval",
  "error.renameFailed": "Failed to rename thread",
  "error.archiveFailed": "Failed to update archive state",
  "error.interruptFailed": "Failed to interrupt turn",
  "generic.workspace": "workspace",
  "generic.image": "Image",
  "generic.imageSubtype": "{subtype} image",
  "generic.file": "File",
  "generic.fileIndexed": "File {index}",
  "generic.plan": "Plan",
  "time.minutesAgo": "{count}m ago",
  "time.hoursAgo": "{count}h ago",
  "time.daysAgo": "{count}d ago"
} as const;

export type MessageKey = keyof typeof en;
type MessageCatalog = Record<MessageKey, string>;
export type MessageVars = Record<string, string | number>;
export type TranslateFn = (key: MessageKey, vars?: MessageVars) => string;

export const MESSAGES: Record<DockLocale, MessageCatalog> = {
  en,
  "zh-CN": {
    "language.label": "语言",
    "nav.newThread": "新线程",
    "nav.automation": "自动化",
    "nav.skills": "技能",
    "sidebar.threads": "线程",
    "sidebar.allProjects": "所有项目",
    "sidebar.archived": "已归档",
    "sidebar.searchPlaceholder": "搜索线程或项目",
    "sidebar.noThreads": "没有匹配的线程",
    "filters.live": "进行中",
    "filters.archived": "已归档",
    "filters.all": "全部",
    "filters.allProjects": "全部项目",
    "aria.threadArchiveFilter": "线程归档筛选",
    "aria.projectFilter": "项目筛选",
    "aria.modelSelection": "模型选择",
    "aria.reasoningEffort": "思考强度",
    "aria.approvalPolicy": "权限策略",
    "aria.jumpToBottom": "跳到底部",
    "aria.language": "语言",
    "thread.untitled": "未命名线程",
    "thread.new": "新线程",
    "stage.readyToBuild": "准备在 {workspace} 中开始构建",
    "stage.startBuilding": "开始构建",
    "stage.loadingThread": "正在加载线程...",
    "stage.threadTitlePlaceholder": "线程标题",
    "actions.saveTitle": "保存标题",
    "actions.cancel": "取消",
    "actions.remove": "移除",
    "actions.send": "发送",
    "actions.jumpToBottom": "跳到底部",
    "actions.takeoverAndContinue": "接管并继续",
    "actions.allowOnce": "允许一次",
    "actions.allowForSession": "本次会话允许",
    "actions.deny": "拒绝",
    "actions.submitAnswers": "提交答案",
    "actions.close": "关闭",
    "actions.uploadImage": "上传图片",
    "actions.stop": "停止",
    "thinking.label": "正在思考",
    "takeover.detectedTitle": "检测到这个 thread 正在其他端活跃。",
    "takeover.detectedBody": "确认后会从网页端接管并继续本轮会话。",
    "takeover.notice": "这个 thread 当前处于活动状态。你下一次发送会接管当前会话。",
    "composer.placeholder": "继续 thread，或从这里开始一个新的 thread...",
    "status.local": "本地",
    "status.tailnet": "Tailnet",
    "status.active": "active",
    "status.idle": "idle",
    "status.notLoaded": "notLoaded",
    "status.systemError": "system error",
    "status.commandFailed": "运行失败",
    "status.commandInterrupted": "已中断",
    "status.commandRunning": "正在运行",
    "status.commandRan": "已运行",
    "status.fileEdited": "已编辑",
    "status.fileAdded": "已新增",
    "status.fileDeleted": "已删除",
    "status.fileRenamed": "已重命名",
    "policies.on-request": "默认权限",
    "policies.untrusted": "完全访问权限",
    "policies.on-failure": "失败时请求",
    "policies.never": "从不请求",
    "request.commandApproval": "命令执行审批",
    "request.fileApproval": "文件变更审批",
    "request.confirmationRequired": "需要你确认后继续",
    "request.workingDirectory": "工作目录",
    "request.commandNeedsApproval": "需要批准后才能执行命令。",
    "request.fileNeedsApproval": "需要你确认后才能继续写入文件。",
    "request.select": "请选择",
    "request.processing": "处理中…",
    "notice.bridgeDisconnected": "Codex bridge 已断开，正在重连。",
    "notice.liveReconnect": "网页实时流正在重连…",
    "error.failedLoadThread": "线程加载失败",
    "error.initializationFailed": "初始化失败",
    "error.refreshThreadsFailed": "线程刷新失败",
    "error.sendFailed": "发送失败",
    "error.uploadFailed": "上传失败",
    "error.requestFailed": "审批提交失败",
    "error.renameFailed": "重命名失败",
    "error.archiveFailed": "归档状态更新失败",
    "error.interruptFailed": "中断失败",
    "generic.workspace": "工作区",
    "generic.image": "图片",
    "generic.imageSubtype": "{subtype} 图片",
    "generic.file": "文件",
    "generic.fileIndexed": "文件 {index}",
    "generic.plan": "计划",
    "time.minutesAgo": "{count} 分钟前",
    "time.hoursAgo": "{count} 小时前",
    "time.daysAgo": "{count} 天前"
  },
  ja: {
    "language.label": "言語",
    "nav.newThread": "新しいスレッド",
    "nav.automation": "自動化",
    "nav.skills": "スキル",
    "sidebar.threads": "スレッド",
    "sidebar.allProjects": "すべてのプロジェクト",
    "sidebar.archived": "アーカイブ済み",
    "sidebar.searchPlaceholder": "スレッドまたはプロジェクトを検索",
    "sidebar.noThreads": "一致するスレッドはありません",
    "filters.live": "進行中",
    "filters.archived": "アーカイブ済み",
    "filters.all": "すべて",
    "filters.allProjects": "すべてのプロジェクト",
    "aria.threadArchiveFilter": "スレッドのアーカイブフィルター",
    "aria.projectFilter": "プロジェクトフィルター",
    "aria.modelSelection": "モデル選択",
    "aria.reasoningEffort": "思考レベル",
    "aria.approvalPolicy": "承認ポリシー",
    "aria.jumpToBottom": "末尾へ移動",
    "aria.language": "言語",
    "thread.untitled": "無題のスレッド",
    "thread.new": "新しいスレッド",
    "stage.readyToBuild": "{workspace} で開始する準備ができました",
    "stage.startBuilding": "作業を開始",
    "stage.loadingThread": "スレッドを読み込み中...",
    "stage.threadTitlePlaceholder": "スレッドタイトル",
    "actions.saveTitle": "タイトルを保存",
    "actions.cancel": "キャンセル",
    "actions.remove": "削除",
    "actions.send": "送信",
    "actions.jumpToBottom": "末尾へ移動",
    "actions.takeoverAndContinue": "引き継いで続行",
    "actions.allowOnce": "一度だけ許可",
    "actions.allowForSession": "このセッションで許可",
    "actions.deny": "拒否",
    "actions.submitAnswers": "回答を送信",
    "actions.close": "閉じる",
    "actions.uploadImage": "画像をアップロード",
    "actions.stop": "停止",
    "thinking.label": "考え中",
    "takeover.detectedTitle": "このスレッドは別の場所でアクティブです。",
    "takeover.detectedBody":
      "Web から引き継いでこのセッションを続行するには確認してください。",
    "takeover.notice":
      "このスレッドは現在アクティブです。次回送信するとこのセッションを引き継ぎます。",
    "composer.placeholder":
      "このスレッドを続けるか、ここから新しいスレッドを開始...",
    "status.local": "ローカル",
    "status.tailnet": "Tailnet",
    "status.active": "active",
    "status.idle": "idle",
    "status.notLoaded": "notLoaded",
    "status.systemError": "system error",
    "status.commandFailed": "失敗",
    "status.commandInterrupted": "中断",
    "status.commandRunning": "実行中",
    "status.commandRan": "実行済み",
    "status.fileEdited": "編集済み",
    "status.fileAdded": "追加済み",
    "status.fileDeleted": "削除済み",
    "status.fileRenamed": "名前変更済み",
    "policies.on-request": "デフォルト承認",
    "policies.untrusted": "フルアクセス",
    "policies.on-failure": "失敗時に確認",
    "policies.never": "確認しない",
    "request.commandApproval": "コマンド承認",
    "request.fileApproval": "ファイル変更承認",
    "request.confirmationRequired": "続行するには確認が必要です",
    "request.workingDirectory": "作業ディレクトリ",
    "request.commandNeedsApproval":
      "このコマンドを実行する前に承認が必要です。",
    "request.fileNeedsApproval":
      "ファイルへ書き込む前に確認が必要です。",
    "request.select": "選択",
    "request.processing": "処理中...",
    "notice.bridgeDisconnected":
      "Codex bridge が切断されました。再接続しています...",
    "notice.liveReconnect": "ライブストリームを再接続しています...",
    "error.failedLoadThread": "スレッドの読み込みに失敗しました",
    "error.initializationFailed": "初期化に失敗しました",
    "error.refreshThreadsFailed": "スレッドの更新に失敗しました",
    "error.sendFailed": "送信に失敗しました",
    "error.uploadFailed": "アップロードに失敗しました",
    "error.requestFailed": "承認の送信に失敗しました",
    "error.renameFailed": "スレッド名の変更に失敗しました",
    "error.archiveFailed": "アーカイブ状態の更新に失敗しました",
    "error.interruptFailed": "ターンの中断に失敗しました",
    "generic.workspace": "ワークスペース",
    "generic.image": "画像",
    "generic.imageSubtype": "{subtype} 画像",
    "generic.file": "ファイル",
    "generic.fileIndexed": "ファイル {index}",
    "generic.plan": "プラン",
    "time.minutesAgo": "{count} 分前",
    "time.hoursAgo": "{count} 時間前",
    "time.daysAgo": "{count} 日前"
  },
  es: {
    "language.label": "Idioma",
    "nav.newThread": "Nuevo hilo",
    "nav.automation": "Automatización",
    "nav.skills": "Habilidades",
    "sidebar.threads": "Hilos",
    "sidebar.allProjects": "Todos los proyectos",
    "sidebar.archived": "Archivados",
    "sidebar.searchPlaceholder": "Buscar hilos o proyectos",
    "sidebar.noThreads": "No hay hilos coincidentes",
    "filters.live": "Activos",
    "filters.archived": "Archivados",
    "filters.all": "Todos",
    "filters.allProjects": "Todos los proyectos",
    "aria.threadArchiveFilter": "Filtro de archivo de hilos",
    "aria.projectFilter": "Filtro de proyecto",
    "aria.modelSelection": "Selección de modelo",
    "aria.reasoningEffort": "Nivel de razonamiento",
    "aria.approvalPolicy": "Política de aprobación",
    "aria.jumpToBottom": "Ir al final",
    "aria.language": "Idioma",
    "thread.untitled": "Hilo sin título",
    "thread.new": "Nuevo hilo",
    "stage.readyToBuild": "Listo para empezar en {workspace}",
    "stage.startBuilding": "Empezar a construir",
    "stage.loadingThread": "Cargando hilo...",
    "stage.threadTitlePlaceholder": "Título del hilo",
    "actions.saveTitle": "Guardar título",
    "actions.cancel": "Cancelar",
    "actions.remove": "Quitar",
    "actions.send": "Enviar",
    "actions.jumpToBottom": "Ir al final",
    "actions.takeoverAndContinue": "Tomar control y continuar",
    "actions.allowOnce": "Permitir una vez",
    "actions.allowForSession": "Permitir en esta sesión",
    "actions.deny": "Denegar",
    "actions.submitAnswers": "Enviar respuestas",
    "actions.close": "Cerrar",
    "actions.uploadImage": "Subir imagen",
    "actions.stop": "Detener",
    "thinking.label": "Pensando",
    "takeover.detectedTitle": "Este hilo está activo en otro lugar.",
    "takeover.detectedBody":
      "Confirma para tomar el control desde la web y continuar esta sesión.",
    "takeover.notice":
      "Este hilo está activo. Tu próximo envío tomará el control de esta sesión.",
    "composer.placeholder":
      "Continúa este hilo o empieza uno nuevo aquí...",
    "status.local": "Local",
    "status.tailnet": "Tailnet",
    "status.active": "active",
    "status.idle": "idle",
    "status.notLoaded": "notLoaded",
    "status.systemError": "system error",
    "status.commandFailed": "Falló",
    "status.commandInterrupted": "Interrumpido",
    "status.commandRunning": "En ejecución",
    "status.commandRan": "Ejecutado",
    "status.fileEdited": "Editado",
    "status.fileAdded": "Añadido",
    "status.fileDeleted": "Eliminado",
    "status.fileRenamed": "Renombrado",
    "policies.on-request": "Aprobación predeterminada",
    "policies.untrusted": "Acceso total",
    "policies.on-failure": "Preguntar al fallar",
    "policies.never": "No preguntar nunca",
    "request.commandApproval": "Aprobación de comando",
    "request.fileApproval": "Aprobación de cambios en archivos",
    "request.confirmationRequired": "Se requiere confirmación para continuar",
    "request.workingDirectory": "Directorio de trabajo",
    "request.commandNeedsApproval":
      "Se requiere aprobación antes de ejecutar este comando.",
    "request.fileNeedsApproval":
      "Se requiere confirmación antes de escribir archivos.",
    "request.select": "Seleccionar",
    "request.processing": "Procesando...",
    "notice.bridgeDisconnected":
      "Codex bridge se desconectó. Reconectando...",
    "notice.liveReconnect": "Reconectando el flujo en vivo...",
    "error.failedLoadThread": "No se pudo cargar el hilo",
    "error.initializationFailed": "La inicialización falló",
    "error.refreshThreadsFailed": "No se pudieron actualizar los hilos",
    "error.sendFailed": "No se pudo enviar",
    "error.uploadFailed": "No se pudo subir",
    "error.requestFailed": "No se pudo enviar la aprobación",
    "error.renameFailed": "No se pudo renombrar el hilo",
    "error.archiveFailed": "No se pudo actualizar el estado de archivo",
    "error.interruptFailed": "No se pudo interrumpir el turno",
    "generic.workspace": "espacio de trabajo",
    "generic.image": "Imagen",
    "generic.imageSubtype": "Imagen {subtype}",
    "generic.file": "Archivo",
    "generic.fileIndexed": "Archivo {index}",
    "generic.plan": "Plan",
    "time.minutesAgo": "hace {count} min",
    "time.hoursAgo": "hace {count} h",
    "time.daysAgo": "hace {count} d"
  },
  fr: {
    "language.label": "Langue",
    "nav.newThread": "Nouveau fil",
    "nav.automation": "Automatisation",
    "nav.skills": "Compétences",
    "sidebar.threads": "Fils",
    "sidebar.allProjects": "Tous les projets",
    "sidebar.archived": "Archivés",
    "sidebar.searchPlaceholder": "Rechercher des fils ou des projets",
    "sidebar.noThreads": "Aucun fil correspondant",
    "filters.live": "Actifs",
    "filters.archived": "Archivés",
    "filters.all": "Tous",
    "filters.allProjects": "Tous les projets",
    "aria.threadArchiveFilter": "Filtre d'archivage des fils",
    "aria.projectFilter": "Filtre de projet",
    "aria.modelSelection": "Sélection du modèle",
    "aria.reasoningEffort": "Niveau de réflexion",
    "aria.approvalPolicy": "Politique d'approbation",
    "aria.jumpToBottom": "Aller en bas",
    "aria.language": "Langue",
    "thread.untitled": "Fil sans titre",
    "thread.new": "Nouveau fil",
    "stage.readyToBuild": "Prêt à démarrer dans {workspace}",
    "stage.startBuilding": "Commencer",
    "stage.loadingThread": "Chargement du fil...",
    "stage.threadTitlePlaceholder": "Titre du fil",
    "actions.saveTitle": "Enregistrer le titre",
    "actions.cancel": "Annuler",
    "actions.remove": "Retirer",
    "actions.send": "Envoyer",
    "actions.jumpToBottom": "Aller en bas",
    "actions.takeoverAndContinue": "Prendre le relais et continuer",
    "actions.allowOnce": "Autoriser une fois",
    "actions.allowForSession": "Autoriser pour la session",
    "actions.deny": "Refuser",
    "actions.submitAnswers": "Envoyer les réponses",
    "actions.close": "Fermer",
    "actions.uploadImage": "Téléverser une image",
    "actions.stop": "Arrêter",
    "thinking.label": "Réflexion en cours",
    "takeover.detectedTitle": "Ce fil est actif ailleurs.",
    "takeover.detectedBody":
      "Confirmez pour reprendre depuis le web et continuer cette session.",
    "takeover.notice":
      "Ce fil est actif. Votre prochain envoi reprendra cette session.",
    "composer.placeholder":
      "Continuez ce fil ou démarrez-en un nouveau ici...",
    "status.local": "Local",
    "status.tailnet": "Tailnet",
    "status.active": "active",
    "status.idle": "idle",
    "status.notLoaded": "notLoaded",
    "status.systemError": "system error",
    "status.commandFailed": "Échec",
    "status.commandInterrupted": "Interrompu",
    "status.commandRunning": "En cours",
    "status.commandRan": "Exécuté",
    "status.fileEdited": "Modifié",
    "status.fileAdded": "Ajouté",
    "status.fileDeleted": "Supprimé",
    "status.fileRenamed": "Renommé",
    "policies.on-request": "Approbation par défaut",
    "policies.untrusted": "Accès complet",
    "policies.on-failure": "Demander en cas d'échec",
    "policies.never": "Ne jamais demander",
    "request.commandApproval": "Approbation de commande",
    "request.fileApproval": "Approbation de modification de fichier",
    "request.confirmationRequired":
      "Une confirmation est requise pour continuer",
    "request.workingDirectory": "Répertoire de travail",
    "request.commandNeedsApproval":
      "Une approbation est requise avant d'exécuter cette commande.",
    "request.fileNeedsApproval":
      "Une confirmation est requise avant d'écrire dans les fichiers.",
    "request.select": "Sélectionner",
    "request.processing": "Traitement...",
    "notice.bridgeDisconnected":
      "Codex bridge est déconnecté. Reconnexion...",
    "notice.liveReconnect": "Reconnexion du flux en direct...",
    "error.failedLoadThread": "Impossible de charger le fil",
    "error.initializationFailed": "Échec de l'initialisation",
    "error.refreshThreadsFailed":
      "Impossible d'actualiser les fils",
    "error.sendFailed": "Échec de l'envoi",
    "error.uploadFailed": "Échec du téléversement",
    "error.requestFailed": "Échec de l'envoi de l'approbation",
    "error.renameFailed": "Impossible de renommer le fil",
    "error.archiveFailed":
      "Impossible de mettre à jour l'état d'archivage",
    "error.interruptFailed": "Impossible d'interrompre le tour",
    "generic.workspace": "espace de travail",
    "generic.image": "Image",
    "generic.imageSubtype": "Image {subtype}",
    "generic.file": "Fichier",
    "generic.fileIndexed": "Fichier {index}",
    "generic.plan": "Plan",
    "time.minutesAgo": "il y a {count} min",
    "time.hoursAgo": "il y a {count} h",
    "time.daysAgo": "il y a {count} j"
  }
};

export function resolveLocale(input: string | null | undefined): DockLocale {
  const normalized = input?.trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_LOCALE;
  }

  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }

  if (normalized.startsWith("ja")) {
    return "ja";
  }

  if (normalized.startsWith("es")) {
    return "es";
  }

  if (normalized.startsWith("fr")) {
    return "fr";
  }

  return "en";
}

export function resolveLocaleFromNavigator(
  languages: readonly string[] | undefined
): DockLocale {
  for (const language of languages ?? []) {
    const resolved = resolveLocale(language);
    if (resolved !== "en" || language.toLowerCase().startsWith("en")) {
      return resolved;
    }
  }

  return DEFAULT_LOCALE;
}

export function getIntlLocale(locale: DockLocale) {
  switch (locale) {
    case "zh-CN":
      return "zh-CN";
    case "ja":
      return "ja-JP";
    case "es":
      return "es-ES";
    case "fr":
      return "fr-FR";
    default:
      return "en-US";
  }
}

export function translate(
  locale: DockLocale,
  key: MessageKey,
  vars?: MessageVars
) {
  const template = MESSAGES[locale][key] ?? en[key];
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(vars[name] ?? `{${name}}`)
  );
}
