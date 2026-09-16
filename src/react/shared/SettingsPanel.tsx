import type { ReactNode } from "react";
import { Popover } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import styles from "./SettingsPanel.module.css";

/** Shared, themed surface for field and parameter settings. */
export function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover.Content className={styles.panel}>
      <Popover.Header className={styles.header}>
        <Popover.Title className={styles.title}>{title}</Popover.Title>
        <Popover.CloseTrigger
          className={styles.close}
          aria-label="Close settings"
        >
          <LuX size={14} />
        </Popover.CloseTrigger>
      </Popover.Header>
      <Popover.Body className={styles.body}>{children}</Popover.Body>
    </Popover.Content>
  );
}
