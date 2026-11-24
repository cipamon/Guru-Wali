import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { WcLog, WcStudent } from '../types/waliconnect';

interface ChartProps {
  darkMode: boolean;
}

export const AttendanceLineChart: React.FC<ChartProps & { students: WcStudent[] }> = ({
  students,
  darkMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const render = () => {
      d3.select(el).selectAll('*').remove();
      const width = el.clientWidth || 440;
      const height = 220;
      const margin = { top: 18, right: 20, bottom: 32, left: 40 };
      const innerW = Math.max(120, width - margin.left - margin.right);
      const innerH = height - margin.top - margin.bottom;

      const sessionData = Array.from({ length: 9 }, (_, i) => {
        const total = students.length || 1;
        const present = students.filter((s) => s.kehadiran?.[i]).length;
        return {
          sesi: `S${i + 1}`,
          pct: students.length === 0 ? 0 : Math.round((present / total) * 100),
          present,
          total: students.length,
        };
      });

      const svg = d3
        .select(el)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const x = d3
        .scalePoint<string>()
        .domain(sessionData.map((d) => d.sesi))
        .range([0, innerW])
        .padding(0.2);

      const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

      // Grid lines
      g.append('g')
        .selectAll('line')
        .data([0, 25, 50, 75, 100])
        .join('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', (d) => y(d))
        .attr('y2', (d) => y(d))
        .attr('stroke', darkMode ? '#1e293b' : '#e2e8f0')
        .attr('stroke-dasharray', '3,3');

      const defs = svg.append('defs');
      const grad = defs
        .append('linearGradient')
        .attr('id', 'wc-att-area')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#2563eb').attr('stop-opacity', 0.28);
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#2563eb').attr('stop-opacity', 0.01);

      const area = d3
        .area<(typeof sessionData)[0]>()
        .x((d) => x(d.sesi) ?? 0)
        .y0(innerH)
        .y1((d) => y(d.pct))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(sessionData).attr('fill', 'url(#wc-att-area)').attr('d', area);

      const line = d3
        .line<(typeof sessionData)[0]>()
        .x((d) => x(d.sesi) ?? 0)
        .y((d) => y(d.pct))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(sessionData)
        .attr('fill', 'none')
        .attr('stroke', '#2563eb')
        .attr('stroke-width', 2.5)
        .attr('d', line);

      g.selectAll('circle')
        .data(sessionData)
        .join('circle')
        .attr('cx', (d) => x(d.sesi) ?? 0)
        .attr('cy', (d) => y(d.pct))
        .attr('r', 4)
        .attr('fill', darkMode ? '#0f172a' : '#ffffff')
        .attr('stroke', '#2563eb')
        .attr('stroke-width', 2)
        .append('title')
        .text((d) => `${d.sesi}: ${d.pct}% (${d.present}/${d.total} murid hadir)`);

      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .call((axis) => axis.select('.domain').attr('stroke', darkMode ? '#334155' : '#cbd5e1'))
        .selectAll('text')
        .attr('fill', darkMode ? '#94a3b8' : '#64748b')
        .style('font-size', '11px');

      g.append('g')
        .call(
          d3
            .axisLeft(y)
            .tickValues([0, 50, 100])
            .tickFormat((d) => `${d}%`)
            .tickSizeOuter(0)
        )
        .call((axis) => axis.select('.domain').remove())
        .selectAll('text')
        .attr('fill', darkMode ? '#94a3b8' : '#64748b')
        .style('font-size', '11px');
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => ro.disconnect();
  }, [students, darkMode]);

  return <div ref={containerRef} className="w-full min-h-[220px]" />;
};

export const JournalDonutChart: React.FC<ChartProps & { logs: WcLog[] }> = ({
  logs,
  darkMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const counts = [
    { label: 'Dalam Proses', value: logs.filter((l) => l.status_kanban === 'Dalam Proses').length, color: '#2563eb' },
    { label: 'Perlu Tindak Lanjut', value: logs.filter((l) => l.status_kanban === 'Perlu Tindak Lanjut').length, color: '#d97706' },
    { label: 'Selesai Tertangani', value: logs.filter((l) => l.status_kanban === 'Selesai Tertangani').length, color: '#16a34a' },
  ];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const render = () => {
      d3.select(el).selectAll('*').remove();
      const size = 180;
      const radius = size / 2 - 8;

      const svg = d3
        .select(el)
        .append('svg')
        .attr('width', size)
        .attr('height', size)
        .attr('viewBox', `0 0 ${size} ${size}`);

      const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`);
      const total = logs.length;

      if (total === 0) {
        g.append('circle')
          .attr('r', radius - 14)
          .attr('fill', 'none')
          .attr('stroke', darkMode ? '#1e293b' : '#e2e8f0')
          .attr('stroke-width', 18);
      } else {
        const pie = d3.pie<(typeof counts)[0]>().value((d) => d.value).sort(null);
        const arc = d3
          .arc<d3.PieArcDatum<(typeof counts)[0]>>()
          .innerRadius(radius - 24)
          .outerRadius(radius);

        g.selectAll('path')
          .data(pie(counts.filter((c) => c.value > 0)))
          .join('path')
          .attr('d', arc)
          .attr('fill', (d) => d.data.color)
          .attr('stroke', darkMode ? '#0f172a' : '#ffffff')
          .attr('stroke-width', 2)
          .append('title')
          .text((d) => `${d.data.label}: ${d.data.value} jurnal`);
      }

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.1em')
        .attr('fill', darkMode ? '#f8fafc' : '#0f172a')
        .style('font-size', '24px')
        .style('font-weight', '700')
        .text(total);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.3em')
        .attr('fill', darkMode ? '#94a3b8' : '#64748b')
        .style('font-size', '11px')
        .text('Total Jurnal');
    };

    render();
  }, [logs, darkMode]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div ref={containerRef} className="shrink-0" />
      <div className="flex-1 space-y-2.5 w-full">
        {counts.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">{item.label}</span>
            </div>
            <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CategoryStackedBarChart: React.FC<ChartProps & { logs: WcLog[] }> = ({
  logs,
  darkMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const categories = ['Akademik', 'Karakter', 'Sosial-Emosional', 'Kedisiplinan', 'Karir'] as const;
    const keys = ['Dalam Proses', 'Perlu Tindak Lanjut', 'Selesai Tertangani'] as const;
    const colors: Record<(typeof keys)[number], string> = {
      'Dalam Proses': '#2563eb',
      'Perlu Tindak Lanjut': '#d97706',
      'Selesai Tertangani': '#16a34a',
    };

    const render = () => {
      d3.select(el).selectAll('*').remove();
      const width = el.clientWidth || 520;
      const height = 220;
      const margin = { top: 16, right: 16, bottom: 38, left: 32 };
      const innerW = Math.max(150, width - margin.left - margin.right);
      const innerH = height - margin.top - margin.bottom;

      const rows = categories.map((cat) => {
        const subset = logs.filter((l) => l.kategori === cat);
        return {
          kategori: cat === 'Sosial-Emosional' ? 'Sos-Emo' : cat,
          'Dalam Proses': subset.filter((l) => l.status_kanban === 'Dalam Proses').length,
          'Perlu Tindak Lanjut': subset.filter((l) => l.status_kanban === 'Perlu Tindak Lanjut').length,
          'Selesai Tertangani': subset.filter((l) => l.status_kanban === 'Selesai Tertangani').length,
        };
      });

      const stack = d3.stack<(typeof rows)[0]>().keys(keys);
      const series = stack(rows);

      const maxVal = Math.max(
        2,
        d3.max(rows, (d) => d['Dalam Proses'] + d['Perlu Tindak Lanjut'] + d['Selesai Tertangani']) ?? 2
      );

      const svg = d3
        .select(el)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const x = d3
        .scaleBand()
        .domain(rows.map((r) => r.kategori))
        .range([0, innerW])
        .padding(0.36);

      const y = d3.scaleLinear().domain([0, maxVal]).nice().range([innerH, 0]);

      g.append('g')
        .selectAll('g')
        .data(series)
        .join('g')
        .attr('fill', (d) => colors[d.key as (typeof keys)[number]])
        .selectAll('rect')
        .data((d) => d)
        .join('rect')
        .attr('x', (d) => x(d.data.kategori) ?? 0)
        .attr('y', (d) => y(d[1]))
        .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
        .attr('width', x.bandwidth())
        .attr('rx', 3)
        .append('title')
        .text((d) => `${d.data.kategori}: ${d[1] - d[0]} catatan`);

      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .call((axis) => axis.select('.domain').attr('stroke', darkMode ? '#334155' : '#cbd5e1'))
        .selectAll('text')
        .attr('fill', darkMode ? '#94a3b8' : '#64748b')
        .style('font-size', '11px');

      g.append('g')
        .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')).tickSizeOuter(0))
        .call((axis) => axis.select('.domain').remove())
        .selectAll('text')
        .attr('fill', darkMode ? '#94a3b8' : '#64748b')
        .style('font-size', '11px');
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => ro.disconnect();
  }, [logs, darkMode]);

  return (
    <div>
      <div ref={containerRef} className="w-full min-h-[220px]" />
      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Dalam Proses
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-600" /> Perlu Tindak Lanjut
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Selesai Tertangani
        </span>
      </div>
    </div>
  );
};
