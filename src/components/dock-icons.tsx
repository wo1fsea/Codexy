type IconName =
  | "codex"
  | "back"
  | "chevron"
  | "compact"
  | "new-thread"
  | "automation"
  | "skills"
  | "settings"
  | "folder"
  | "menu"
  | "search"
  | "play"
  | "refresh"
  | "rename"
  | "archive"
  | "image"
  | "send"
  | "stop"
  | "workspace"
  | "security"
  | "repo"
  | "desktop"
  | "plus"
  | "logout";

export const APP_MENU_ITEMS = ["File", "Edit", "View", "Window", "Help"];

export const SIDEBAR_ITEMS: Array<{
  key: string;
  labelKey: "nav.newThread" | "nav.automation" | "nav.skills";
  icon: IconName;
  primary?: boolean;
}> = [
  {
    key: "new-thread",
    labelKey: "nav.newThread",
    icon: "new-thread",
    primary: true
  },
  { key: "automation", labelKey: "nav.automation", icon: "automation" },
  { key: "skills", labelKey: "nav.skills", icon: "skills" }
];

export function AppIcon({
  name,
  className
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "codex") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M8.2 4.2c1.2 0 2 .6 2.5 1.5.4-.5 1-.9 1.8-.9 1.6 0 2.8 1.3 2.8 2.9 0 .5-.1.9-.3 1.3 1.5.2 2.7 1.5 2.7 3.1 0 1.8-1.4 3.2-3.2 3.2-.3 0-.6 0-.9-.1-.1 1.7-1.5 3.1-3.2 3.1-1.1 0-2-.5-2.6-1.3-.6.6-1.4 1-2.3 1-1.8 0-3.2-1.4-3.2-3.2 0-.4.1-.8.2-1.1-1.4-.3-2.5-1.6-2.5-3.1 0-1.7 1.4-3.1 3.1-3.1.2 0 .3 0 .5.1C5.9 5.4 6.9 4.2 8.2 4.2Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  const props = {
    "aria-hidden": true,
    className,
    fill: "none",
    viewBox: "0 0 24 24"
  } as const;

  switch (name) {
    case "back":
      return (
        <svg {...props}>
          <path
            d="M14.5 6.5 9 12l5.5 5.5M10 12h8.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case "new-thread":
      return (
        <svg {...props}>
          <path d="M4.5 6.5h8m-8 5h15m-15 5h10M17 4.5v5m-2.5-2.5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "compact":
      return (
        <svg {...props}>
          <path d="M7 7.5h7.5v7H7z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          <path d="M9.5 5.5H17v7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      );
    case "automation":
      return (
        <svg {...props}>
          <path d="M12 4.5v3m0 9v3m7.5-7.5h-3m-9 0h-3m10.8-5.3-2 2m-6.6 6.6-2 2m0-11.2 2 2m6.6 6.6 2 2M12 8.3a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "skills":
      return (
        <svg {...props}>
          <path d="M7 6.5h3.5v3.5H7zM13.5 6.5H17v3.5h-3.5zM7 13h3.5v3.5H7zM13.5 13H17v3.5h-3.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <path d="M12 8.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Zm7 3.2-.9.4a6.8 6.8 0 0 1-.4 1l.5.9-1.7 1.7-.9-.5a6.8 6.8 0 0 1-1 .4l-.4.9h-2.4l-.4-.9a6.8 6.8 0 0 1-1-.4l-.9.5-1.7-1.7.5-.9a6.8 6.8 0 0 1-.4-1L5 12l.4-2.4.9-.4c.1-.4.2-.7.4-1l-.5-.9 1.7-1.7.9.5c.3-.2.7-.3 1-.4l.4-.9h2.4l.4.9c.4.1.7.2 1 .4l.9-.5 1.7 1.7-.5.9c.2.3.3.6.4 1l.9.4L19 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path d="M4.5 8.5a2 2 0 0 1 2-2h3l1.2 1.4H17.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-7.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <path d="M11 5.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm7.5 13.5-3.3-3.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "play":
      return (
        <svg {...props}>
          <path d="m9 7 8 5-8 5V7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...props}>
          <path d="M18.5 9.2A7 7 0 0 0 6.8 7.1M5.5 4.8v3.5H9M5.5 14.8A7 7 0 0 0 17.2 17m1.3 2.2v-3.5H15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "rename":
      return (
        <svg {...props}>
          <path d="m5 16.5 8.8-8.8 2.5 2.5-8.8 8.8L5 19l.2-2.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "archive":
      return (
        <svg {...props}>
          <path d="M5.5 6.5h13l-1 11a1.6 1.6 0 0 1-1.6 1.4H8.1a1.6 1.6 0 0 1-1.6-1.4l-1-11Zm-1-2h15m-8 6.2h1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "image":
      return (
        <svg {...props}>
          <path d="M6.5 6.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2.5 3.2h.01M7 15l3-3 2.2 2.2 2.3-2.7L17 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "send":
      return (
        <svg {...props}>
          <path d="M12 17V7M7.5 11.5 12 7l4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      );
    case "stop":
      return (
        <svg {...props}>
          <rect x="8" y="8" width="8" height="8" rx="1.7" fill="currentColor" />
        </svg>
      );
    case "workspace":
      return (
        <svg {...props}>
          <path d="M4.5 6.5h15v9h-15zm5.5 12h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "security":
      return (
        <svg {...props}>
          <path d="M8.2 10.4V8.8a3.8 3.8 0 1 1 7.6 0v1.6m-7 0h6.4a1.6 1.6 0 0 1 1.6 1.6v4a1.6 1.6 0 0 1-1.6 1.6H8.8A1.6 1.6 0 0 1 7.2 16v-4a1.6 1.6 0 0 1 1.6-1.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "repo":
      return (
        <svg {...props}>
          <path d="M7.5 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 9.5l6 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "desktop":
      return (
        <svg {...props}>
          <path d="M4.5 6.5h15v9h-15zm5.5 12h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path
            d="M10.5 6.5H7.8a1.8 1.8 0 0 0-1.8 1.8v7.4a1.8 1.8 0 0 0 1.8 1.8h2.7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M13 8.5 16.5 12 13 15.5M10.5 12h6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    default:
      return null;
  }
}
