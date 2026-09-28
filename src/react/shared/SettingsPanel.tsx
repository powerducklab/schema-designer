import type { ReactNode } from "react";
import { Popover } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import styles from "./SettingsPanel.module.css";
import { useInlineSchemaLabels } from "../inlineSchemaEditor/labels";

/** Shared, themed surface for field and parameter settings. */
export function SettingsPanel({
  title,
  children,
  closeLabel,
}: {
  title: string;
  children: ReactNode;
  closeLabel?: string;
}) {
  // Default to the localized inline labels context so every settings surface
  // (inline schema editor, parameter table, schema tree) shares one close label
  // without each call site drilling it in. Standalone callers keep English.
  const labels = useInlineSchemaLabels();
  return (
    <Popover.Content className={styles.panel}>
      <Popover.Header className={styles.header}>
        <Popover.Title className={styles.title}>{title}</Popover.Title>
        <Popover.CloseTrigger
          className={styles.close}
          aria-label={closeLabel ?? labels.closeSettings}
        >
          <LuX size={14} />
        </Popover.CloseTrigger>
      </Popover.Header>
      <Popover.Body className={styles.body}>{children}</Popover.Body>
    </Popover.Content>
  );
}
