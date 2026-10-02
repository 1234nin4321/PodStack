'use strict';

import React from 'react';

import Character from '../../models/Character';
import FarmCharacter from '../../models/FarmCharacter';
import FarmHelper from '../../helpers/FarmHelper';
import FarmProfitHelper, {SUBSCRIPTIONS, PRICED_ITEMS, MINUTES_PER_MONTH, INJECTOR_SP} from '../../helpers/FarmProfitHelper';
import FormatHelper from '../../helpers/FormatHelper';
import Panel from '../ui/Panel';

function isk(value) {
    return value === null || value === undefined || isNaN(value) ? '—' : FormatHelper.compact(value);
}

function signedIsk(value) {
    return value === null || value === undefined || isNaN(value) ? '—' : `${value < 0 ? '−' : '+'}${FormatHelper.compact(Math.abs(value))}`;
}

function parse(value) {
    const n = parseFloat(value);
    return isNaN(n) || n < 0 ? undefined : n;
}

// Monthly profit or loss of every SP farm, from Jita prices or the player's own (e.g. New Eden Store sale prices in
// PLEX). Settings are kept between sessions.
export default class FarmProfitPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {market: undefined, error: false, settings: FarmProfitHelper.getSettings()};
    }

    componentDidMount() {
        this.subscriberId = FarmCharacter.subscribe(this);
        FarmProfitHelper.getMarketPrices()
            .then(market => !this.unmounted && this.setState({market}, () => this.reportPrices()))
            // your own prices still work without the market
            .catch(() => !this.unmounted && this.setState({error: true, market: {injector: null, extractor: null, plex: null, mct: null}},
                () => this.reportPrices()));
    }

    componentWillUnmount() {
        this.unmounted = true;
        FarmCharacter.unsubscribe(this.subscriberId);
    }

    // the page's "Profit / 30 days" tile uses the same prices
    reportPrices() {
        if (this.props.onPrices && this.state.market !== undefined) {
            this.props.onPrices(FarmProfitHelper.resolvePrices(this.state.market, this.state.settings), this.state.settings);
        }
    }

    updateSettings(changes) {
        const settings = {...this.state.settings, ...changes};
        FarmProfitHelper.setSettings(settings);
        this.setState({settings}, () => this.reportPrices());
    }

    // switching to "my price" starts from the market price, converted to PLEX
    setSource(id, source) {
        const {market, settings} = this.state;
        const own = {...settings[id], source};
        if (source === 'custom' && id === 'plex' && own.isk === undefined && market && market.plex) {
            own.isk = Math.round(market.plex);
        }
        if (source === 'custom' && id !== 'plex' && own.plex === undefined && market && market[id] && market.plex) {
            own.plex = Math.round(market[id] / market.plex);
        }
        this.updateSettings({[id]: own});
    }

    renderPrices(prices) {
        const {market, settings} = this.state;
        const marketText = id => market === undefined ? 'loading…' : market[id] === null ? 'no Jita sellers' : `${isk(market[id])} ISK`;

        return (
            <table className="data-table profit-settings">
                <thead>
                    <tr>
                        <th>Price</th>
                        <th>Source</th>
                        <th>Your price</th>
                        <th className="right">ISK used</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>PLEX</td>
                        <td>
                            <select className="health-account-select" value={settings.plex.source} onChange={e => this.setSource('plex', e.target.value)}>
                                <option value="market">Jita ({marketText('plex')})</option>
                                <option value="custom">My price</option>
                            </select>
                        </td>
                        <td>
                            {settings.plex.source === 'custom' &&
                                <span className="profit-input">
                                    <input className="field small" type="number" min={0} value={settings.plex.isk === undefined ? '' : settings.plex.isk}
                                           onChange={e => this.updateSettings({plex: {...settings.plex, isk: parse(e.target.value)}})}/>
                                    ISK each
                                </span>
                            }
                        </td>
                        <td className="right num">{isk(prices.plex)}</td>
                    </tr>
                    <tr>
                        <td>Omega (30 days)</td>
                        <td className="muted">New Eden Store</td>
                        <td>
                            <span className="profit-input">
                                <input className="field small" type="number" min={0} value={settings.omegaPlex}
                                       onChange={e => this.updateSettings({omegaPlex: parse(e.target.value) || 0})}/>
                                PLEX
                            </span>
                        </td>
                        <td className="right num">{isk(prices.omega)}</td>
                    </tr>
                    {PRICED_ITEMS.map(item =>
                        <tr key={item.id}>
                            <td>{item.label} <span className="muted">· {item.note}</span></td>
                            <td>
                                <select className="health-account-select" value={settings[item.id].source}
                                        onChange={e => this.setSource(item.id, e.target.value)}>
                                    <option value="market">Jita ({marketText(item.id)})</option>
                                    <option value="custom">My price (PLEX)</option>
                                </select>
                            </td>
                            <td>
                                {settings[item.id].source === 'custom' &&
                                    <span className="profit-input">
                                        <input className="field small" type="number" min={0}
                                               value={settings[item.id].plex === undefined ? '' : settings[item.id].plex}
                                               onChange={e => this.updateSettings({[item.id]: {...settings[item.id], plex: parse(e.target.value)}})}/>
                                        PLEX
                                    </span>
                                }
                            </td>
                            <td className="right num">{isk(prices[item.id])}</td>
                        </tr>
                    )}
                    <tr>
                        <td>Sell fees</td>
                        <td className="muted">Sales tax + broker fee</td>
                        <td>
                            <span className="profit-input">
                                <input className="field small" type="number" min={0} max={50} step={0.1} value={settings.feesPercent}
                                       onChange={e => this.updateSettings({feesPercent: Math.min(50, parse(e.target.value) || 0)})}/>
                                %
                            </span>
                        </td>
                        <td className="right num">{isk(prices.injector * settings.feesPercent / 100)} <span className="muted">per injector</span></td>
                    </tr>
                </tbody>
            </table>
        );
    }

    renderFarms(prices) {
        const {settings} = this.state;
        const rows = FarmCharacter.getAll()
            .map(farm => ({farm, char: Character.get(farm.id)}))
            .filter(o => o.char !== undefined)
            .map(o => ({...o, result: FarmProfitHelper.forFarm(o.char, o.farm, prices, settings)}));

        if (rows.length === 0) {
            return <p className="empty" style={{margin: 0, padding: 16}}>Add a farm to see its monthly profit.</p>;
        }

        const total = key => rows.reduce((sum, o) => sum + o.result[key], 0);
        const profit = total('profit');
        const profitColor = v => (v >= 0 ? 'var(--good)' : 'var(--danger)');

        return (
            <div>
                <table className="data-table profit-farms">
                    <thead>
                        <tr>
                            <th>Farm</th>
                            <th>Pays for</th>
                            <th className="right">SP/min</th>
                            <th className="right">Injectors</th>
                            <th className="right">Sales</th>
                            <th className="right">Extractors</th>
                            <th className="right">Subscription</th>
                            <th className="right">Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({farm, char, result}) =>
                            <tr key={farm.id}>
                                <td>{char.name}</td>
                                <td>
                                    <select className="health-account-select" value={farm.subscription || 'omega'}
                                            onChange={e => FarmHelper.setSubscription(farm.id, e.target.value)}>
                                        {SUBSCRIPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </td>
                                <td className="right num">{FormatHelper.number(result.spPerMinute, 1)}</td>
                                <td className="right num">{FormatHelper.number(result.injectorsPerMonth, 2)}</td>
                                <td className="right num">{isk(result.income)}</td>
                                <td className="right num muted">−{isk(result.extractors)}</td>
                                <td className="right num muted">−{isk(result.subscription)}</td>
                                <td className="right num" style={{color: profitColor(result.profit)}}>{signedIsk(result.profit)}</td>
                            </tr>
                        )}
                        <tr className="total-row">
                            <td colSpan={2}>Total</td>
                            <td className="right num">{FormatHelper.number(total('spPerMinute'), 1)}</td>
                            <td className="right num">{FormatHelper.number(total('injectorsPerMonth'), 2)}</td>
                            <td className="right num">{isk(total('income'))}</td>
                            <td className="right num muted">−{isk(total('extractors'))}</td>
                            <td className="right num muted">−{isk(total('subscription'))}</td>
                            <td className="right num" style={{color: profitColor(profit)}}>{signedIsk(profit)}</td>
                        </tr>
                    </tbody>
                </table>

                <div className={`profit-result ${profit >= 0 ? 'good' : 'bad'}`}>
                    <div>
                        <div className="stat-label">{profit >= 0 ? 'Monthly profit' : 'Monthly loss'}</div>
                        <div className="profit-result-value num">{signedIsk(profit)} <small>ISK / 30 days</small></div>
                    </div>
                    <div className="muted profit-math">
                        SP/min × {FormatHelper.number(MINUTES_PER_MONTH)} min ÷ {FormatHelper.number(INJECTOR_SP)} SP = injectors per 30 days.
                        Each sells for {isk(prices.injector)} less {settings.feesPercent}% fees, minus an extractor
                        ({isk(prices.extractor)}): <b>{isk(FarmProfitHelper.profitPerInjector(prices, settings))}</b> per injector,
                        before subscriptions. Injectors ready now are worth {isk(total('readyValue'))}.
                    </div>
                </div>
            </div>
        );
    }

    render() {
        const {market, error, settings} = this.state;
        const prices = market !== undefined ? FarmProfitHelper.resolvePrices(market, settings) : undefined;

        let farms;
        if (prices === undefined) {
            farms = <p className="empty" style={{margin: 0, padding: 16}}>Loading Jita prices…</p>;
        } else if (!FarmProfitHelper.isComplete(prices) && error) {
            farms = <p className="empty" style={{margin: 0, padding: 16}}>Couldn't load Jita prices. Set your own prices above, or try again later.</p>;
        } else if (!FarmProfitHelper.isComplete(prices)) {
            farms = <p className="empty" style={{margin: 0, padding: 16}}>Some prices are missing. Enter your own for the ones marked "—".</p>;
        } else {
            farms = this.renderFarms(prices);
        }

        return (
            <Panel title="Profitability" icon="savings" flush={true} style={{marginTop: 16}}
                   subtitle="Per 30 days at each farm's current training speed">
                {this.renderPrices(prices || {plex: null, omega: null, injector: null, extractor: null, mct: null})}
                {farms}
            </Panel>
        );
    }
}
