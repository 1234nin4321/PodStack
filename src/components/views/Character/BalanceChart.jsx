'use strict';

import React from 'react';

import FormatHelper from '../../../helpers/FormatHelper';

const HEIGHT = 190;
const PAD = {top: 12, right: 16, bottom: 24, left: 60};

// ~count round values covering min..max
function niceTicks(min, max, count = 4) {
    if (max === min) {
        return [min];
    }
    const raw = (max - min) / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= raw);
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
        ticks.push(v);
    }
    return ticks;
}

function shortDate(time) {
    return new Date(time).toLocaleDateString(navigator.language, {month: 'short', day: 'numeric'});
}

// The wallet balance over the journal's 30 days: a stepped line (the balance only changes with an entry), with a
// crosshair that snaps to the nearest entry and shows it.
export default class BalanceChart extends React.Component {
    constructor(props) {
        super(props);

        this.state = {width: 0, hover: undefined};
        this.container = React.createRef();
    }

    componentDidMount() {
        this.observer = new ResizeObserver(entries => this.setState({width: Math.floor(entries[0].contentRect.width)}));
        this.observer.observe(this.container.current);
    }

    componentWillUnmount() {
        this.observer.disconnect();
    }

    // [{time, balance, entry}] oldest first, ending with the current balance now
    points() {
        const points = this.props.journal
            .filter(e => typeof e.balance === 'number')
            .map(e => ({time: new Date(e.date).getTime(), balance: e.balance, entry: e}))
            .sort((a, b) => a.time - b.time);
        if (points.length > 0 && typeof this.props.balance === 'number') {
            points.push({time: Date.now(), balance: this.props.balance, entry: undefined});
        }
        return points;
    }

    handleMove(e, points, x) {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        let nearest = 0;
        points.forEach((p, i) => {
            if (Math.abs(x(p.time) - px) < Math.abs(x(points[nearest].time) - px)) {
                nearest = i;
            }
        });
        this.setState({hover: nearest});
    }

    renderChart(points) {
        const width = this.state.width;
        const plotW = width - PAD.left - PAD.right;
        const plotH = HEIGHT - PAD.top - PAD.bottom;

        const t0 = points[0].time;
        const t1 = Math.max(points[points.length - 1].time, t0 + 1);
        const balances = points.map(p => p.balance);
        let lo = Math.min(...balances);
        let hi = Math.max(...balances);
        const margin = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
        lo = Math.max(0, lo - margin);
        hi = hi + margin;

        const x = t => PAD.left + (t - t0) / (t1 - t0) * plotW;
        const y = v => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

        let line = `M${x(points[0].time)},${y(points[0].balance)}`;
        for (let i = 1; i < points.length; i++) {
            line += ` H${x(points[i].time)} V${y(points[i].balance)}`;
        }
        const area = `${line} V${PAD.top + plotH} H${x(points[0].time)} Z`;

        const yTicks = niceTicks(lo, hi);
        const days = (t1 - t0) / 86400000;
        const xTickCount = Math.max(2, Math.min(6, Math.floor(plotW / 110)));
        const xTicks = Array.from({length: xTickCount}, (_, i) => t0 + (t1 - t0) * i / (xTickCount - 1));

        const hover = this.state.hover !== undefined ? points[this.state.hover] : undefined;
        const tipLeft = hover !== undefined ? Math.min(Math.max(x(hover.time) + 12, PAD.left), width - 220) : 0;

        return (
            <div style={{position: 'relative'}}>
                <svg width={width} height={HEIGHT} className="balance-chart" role="img"
                     aria-label={`Wallet balance from ${shortDate(t0)} to ${shortDate(t1)}`}
                     onMouseMove={e => this.handleMove(e, points, x)}
                     onMouseLeave={() => this.setState({hover: undefined})}>
                    {yTicks.map(v =>
                        <g key={v}>
                            <line className="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)}/>
                            <text className="tick" x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">{FormatHelper.compact(v, 1)}</text>
                        </g>
                    )}
                    {xTicks.map((t, i) =>
                        <text key={i} className="tick" x={x(t)} y={HEIGHT - 6}
                              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
                            {days > 2 ? shortDate(t) : new Date(t).toLocaleTimeString(navigator.language, {hour: '2-digit', minute: '2-digit'})}
                        </text>
                    )}
                    <path className="area" d={area}/>
                    <path className="line" d={line}/>
                    {hover !== undefined &&
                        <g>
                            <line className="crosshair" x1={x(hover.time)} x2={x(hover.time)} y1={PAD.top} y2={PAD.top + plotH}/>
                            <circle className="dot" cx={x(hover.time)} cy={y(hover.balance)} r={4.5}/>
                        </g>
                    }
                </svg>
                {hover !== undefined &&
                    <div className="chart-tip" style={{left: tipLeft, top: PAD.top}}>
                        <div className="muted">{new Date(hover.time).toLocaleString(navigator.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</div>
                        <div className="num chart-tip-value">{FormatHelper.number(hover.balance, 2)} ISK</div>
                        {hover.entry !== undefined ?
                            <div className={hover.entry.amount >= 0 ? 'isk-in' : 'isk-out'}>
                                {hover.entry.amount >= 0 ? '+' : ''}{FormatHelper.compact(hover.entry.amount)} · {this.props.label(hover.entry.ref_type)}
                            </div> :
                            <div className="muted">Now</div>}
                    </div>
                }
            </div>
        );
    }

    render() {
        const points = this.points();

        return (
            <div ref={this.container}>
                {points.length < 2 ?
                    <p className="empty" style={{margin: 0, padding: 16}}>Not enough wallet activity in the last 30 days to chart.</p> :
                    this.state.width > 0 && this.renderChart(points)}
            </div>
        );
    }
}
