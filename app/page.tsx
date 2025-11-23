"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { Database } from "sql.js";
import { orders } from "@/lib/dataset";
import { translateToSql } from "@/lib/nlToSql";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const SAMPLE_PROMPTS = [
  "total sales by region",
  "show average amount for electronics in february",
  "top 5 customers by revenue",
  "number of orders between january and march by category",
  "list grocery orders in the south region"
];

type QueryState = {
  sql: string;
  explanation: string;
};

type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

type ChartState = {
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
} | null;

export default function Page() {
  const dbRef = useRef<Database | null>(null);
  const [naturalInput, setNaturalInput] = useState("");
  const [queryState, setQueryState] = useState<QueryState>(() => translateToSql(""));
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [chartState, setChartState] = useState<ChartState>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const { default: initSqlJs } = await import("sql.js");
      const SQL = await initSqlJs({
        locateFile: (file) => `/` + file
      });

      if (!isMounted) {
        return;
      }

      const db = new SQL.Database();
      db.exec(`CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer TEXT,
        region TEXT,
        category TEXT,
        amount REAL,
        quantity INTEGER,
        order_date TEXT,
        order_month TEXT,
        order_year INTEGER
      );`);

      const insert = db.prepare(`
        INSERT INTO orders (id, customer, region, category, amount, quantity, order_date, order_month, order_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      orders.forEach((order) => {
        insert.run([
          order.id,
          order.customer,
          order.region,
          order.category,
          order.amount,
          order.quantity,
          order.order_date,
          order.order_date.slice(0, 7),
          Number(order.order_date.slice(0, 4))
        ]);
      });

      insert.free();
      dbRef.current = db;
      setReady(true);
    };

    bootstrap();

    return () => {
      isMounted = false;
      dbRef.current?.close();
    };
  }, []);

  useEffect(() => {
    setQueryState(translateToSql(naturalInput));
  }, [naturalInput]);

  const canExecute = useMemo(() => ready && Boolean(queryState.sql.trim()), [ready, queryState.sql]);

  const runQuery = async () => {
    if (!canExecute || !dbRef.current) return;
    setIsExecuting(true);
    setError(null);

    try {
      const result = dbRef.current.exec(queryState.sql);
      if (!result.length) {
        setQueryResult({ columns: [], rows: [] });
        setChartState(null);
        setIsExecuting(false);
        return;
      }

      const [first] = result;
      const columns = first.columns;
      const rows = first.values.map((valueRow) => {
        return first.columns.reduce<Record<string, unknown>>((acc, column, index) => {
          acc[column] = valueRow[index];
          return acc;
        }, {});
      });

      setQueryResult({ columns, rows });
      setChartState(deriveChartState(rows, columns));
    } catch (err) {
      setError((err as Error).message);
      setQueryResult(null);
      setChartState(null);
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    if (ready) {
      runQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Natural Language SQL Agent</h1>
        <p className="text-slate-300 max-w-3xl">
          Type a simple English request. The agent will translate it into SQL, run the query on the
          embedded operations dataset, and render both the raw results and a visualization when
          possible.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300" htmlFor="nl-query">
            Natural language request
          </label>
          <textarea
            id="nl-query"
            placeholder="e.g. total sales by region for February"
            value={naturalInput}
            onChange={(event) => setNaturalInput(event.target.value)}
            rows={4}
            className="w-full resize-none bg-slate-800 border border-slate-700 focus:border-sky-400 focus:outline-none px-4 py-3 text-base"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={runQuery}
              disabled={!canExecute || isExecuting}
              className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {isExecuting ? "Running..." : "Generate & Execute"}
            </button>
            <p className="text-xs text-slate-500">{queryState.explanation}</p>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Try these</h2>
          {SAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setNaturalInput(prompt)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm hover:border-sky-500"
            >
              {prompt}
            </button>
          ))}
        </aside>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">Generated SQL</h2>
        <pre className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-sky-300 overflow-auto">
          {queryState.sql}
        </pre>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-200">Query Result</h2>
          {!isExecuting && queryResult?.rows.length ? (
            <span className="text-xs rounded-full bg-sky-500/10 px-3 py-1 text-sky-300">
              {queryResult.rows.length} rows
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {queryResult && queryResult.columns.length ? (
          <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-950/40">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  {queryResult.columns.map((column) => (
                    <th key={column} className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-slate-400">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/50">
                {queryResult.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {queryResult.columns.map((column) => {
                      const value = row[column];
                      return (
                        <td key={column} className="px-4 py-3 whitespace-nowrap text-slate-200">
                          {formatCell(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {chartState ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-200">Visualization</h2>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
            <Bar data={chartState.data} options={chartState.options} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatCell(value: unknown) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }

    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    if (/^\d{4}-\d{2}$/.test(value)) {
      return value;
    }
  }

  return String(value ?? "");
}

function deriveChartState(rows: Record<string, unknown>[], columns: string[]): ChartState {
  if (!rows.length || !columns.length) return null;

  const labelColumn = columns.find((column) => typeof rows[0][column] === "string") ?? columns[0];
  const numericColumns = columns.filter((column) => typeof rows[0][column] === "number");

  if (!numericColumns.length) return null;

  const dataset = numericColumns[0];
  const labels = rows.map((row) => String(row[labelColumn] ?? ""));
  const data = rows.map((row) => Number(row[dataset] ?? 0));

  if (!data.some((value) => value !== 0)) return null;

  return {
    data: {
      labels,
      datasets: [
        {
          label: dataset.replace(/_/g, " "),
          data,
          backgroundColor: "rgba(56, 189, 248, 0.7)"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, labels: { color: "#cbd5f5" } },
        title: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#cbd5f5" },
          grid: { color: "rgba(148, 163, 184, 0.2)" }
        },
        y: {
          ticks: { color: "#cbd5f5" },
          grid: { color: "rgba(148, 163, 184, 0.15)" }
        }
      }
    }
  };
}
