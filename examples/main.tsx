import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  SchemaTreeEditor,
  InlineSchemaEditor,
  ParametersTable,
} from "../dist/index.js";
import type { SchemaValue } from "../src/core/types";
import type { OpenApiParameter } from "../src/react/parametersTable/libs/types";
import "../dist/styles.css";
import "./tokens.css";
import "./style.css";

function App() {
  const [dark, setDark] = useState(false);
  const [schema, setSchema] = useState<SchemaValue>({
    type: "object",
    $defs: {
      Address: {
        type: "object",
        properties: {
          city: { type: "string" },
          postalCode: { type: "string" },
        },
      },
    },
    properties: {
      id: {
        type: "string",
        format: "uuid",
        description: "Unique customer identifier",
        "x-feature": "preserved",
      },
      name: { type: "string", minLength: 2 },
      shipping: { $ref: "#/$defs/Address" },
      billing: { $ref: "#/$defs/Address" },
      blocked: false,
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  });
  const [field, setField] = useState<SchemaValue>({
    type: "string",
    format: "email",
    description: "Customer email",
    examples: ["hello@example.com"],
  });
  const [parameters, setParameters] = useState<OpenApiParameter[]>([
    {
      in: "path",
      name: "customerId",
      required: true,
      schema: { type: "string" },
      example: "cus_123",
    },
    {
      in: "query",
      name: "limit",
      description: "Maximum number of results",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    {
      in: "header",
      name: "X-Request-ID",
      schema: { type: "string", format: "uuid" },
    },
  ]);
  const [details, setDetails] = useState(false);
  const [tab, setTab] = useState("tree");
  return (
    <main>
      <header>
        <div>
          <h1>Schema Designer</h1>
          <p>One schema model. Three focused editors.</p>
        </div>
        <button
          aria-label="Toggle theme"
          onClick={() => {
            document.documentElement.dataset.theme = dark ? "light" : "dark";
            document.documentElement.classList.toggle("dark", !dark);
            setDark(!dark);
          }}
        >
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </header>
      <nav>
        {["tree", "inline", "design", "request"].map((item) => (
          <button
            key={item}
            aria-pressed={item === tab}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
        <button aria-pressed={details} onClick={() => setDetails(!details)}>
          {details ? "Compact columns" : "Show all columns"}
        </button>
      </nav>
      <section>
        {tab === "tree" ? (
          <SchemaTreeEditor
            showRequired={details}
            showDescription={details}
            value={schema}
            onChange={setSchema}
            defaultExpanded={[
              "properties/shipping",
              "properties/billing",
              "properties/tags",
            ]}
          />
        ) : tab === "inline" ? (
          <InlineSchemaEditor
            value={field}
            onChange={setField}
            schemaName="email"
          />
        ) : (
          <ParametersTable
            showType={details}
            showRequired={details}
            showDescription={details}
            mode={tab as "design" | "request"}
            parameters={parameters}
            onChange={setParameters}
            height="auto"
          />
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <ChakraProvider value={defaultSystem}>
    <App />
  </ChakraProvider>,
);
