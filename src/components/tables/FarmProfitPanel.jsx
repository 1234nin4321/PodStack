'use strict';

import React from 'react';

import Character from '../../models/Character';
import FarmCharacter from '../../models/FarmCharacter';
import FarmHelper from '../../helpers/FarmHelper';
import FarmProfitHelper, {SUBSCRIPTIONS} from '../../helpers/FarmProfitHelper';
import FormatHelper from '../../helpers/FormatHelper';
import Panel from '../ui/Panel';

function isk(value) {
    return value === null || value === undefined || isNaN(value) ? '—' : `${FormatHelper.compact(value)}`;
}

// Profit per farm per 30 days at its current training rate, from Jita prices; settings are kept between sessions.
export default class FarmProfitPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {prices: undefined, error: false, settings: FarmProfitHelper.getSettings()};
    }

    componentDidMount() {
        this.subscriberId = FarmCharacter.subscribe(this);
        FarmProfitHelper.getPrices()
            .then(prices => {
                if (!this.unmounted) {
                    this.setState({prices});
                    this.props.onPrices && this.props.onPrices(prices);
                }
            })
            .catch(() => !this.unmounted && this.setState({error: true}));
    }

    componentWillUnmount() {
        this.unmounted = true;
        FarmCharacter.unsubscribe(this.subscriberId);
    }

    updateSettings(changes) {
        const settings = {...this.state.settings, ...changes};
        FarmProfitHelper.setSettings(settings);
        this.setState({settings});
    }

    renderBody() {
        const {prices, settings} = this.state;
        if (this.state.error || (prices !== undefined && Object.values(prices).some(p => p === null))) {
            return <p className="empty" style={{margin: 0, padding: 16}}>Couldn't load Jita prices. They'll be retried next time you open this page.</p>;
        }
        if (prices === undefined) {
            return <p className="empty" style={{margin: 0, padding: 16}}>Loading Jita prices…</p>;
        }

        const rows = FarmCharacter.getAll()
            .map(farm => ({farm, char: Character.get(farm.id)}))
            .filter(o => o.char !== undefined)
            .map(o => ({...o, result: FarmProfitHelper.forFarm(o.char, o.farm, prices, settings)}));
        const total = key => rows.reduce((sum, o) => sum + o.result[key], 0);

        return (
            <div>
                <div className="profit-prices">
                    <span>Injector <b className="num">{isk(prices.injector)}</b></span>
                    <span>Extractor <b className="num">{isk(prices.extractor)}</b></span>
                    <span>PLEX <b className="num">{isk(prices.plex)}</b></span>
                    <span>MCT certificate <b className="num">{isk(prices.mptc)}</b></span>
                    <span>Profit per injector <b className="num" style={{color: 'var(--good)'}}>{isk(FarmProfitHelper.profitPerInjector(prices, settings))}</b></span>
                    <label>
                        Omega
                        <input className="field small" type="number" min={0} value={settings.omegaPlex}
                               onChange={e => this.updateSettings({omegaPlex: Math.max(0, parseFloat(e.target.value) || 0)})}/>
                        PLEX / 30 days
                    </label>
                    <label>
                        Sell fees
                        <input className="field small" type="number" min={0} max={50} step={0.1} value={settings.feesPercent}
                               onChange={e => this.updateSettings({feesPercent: Math.max(0, Math.min(50, parseFloat(e.target.value) || 0))})}/>
                        %
                    </label>
                </div>

                {rows.length > 0 &&
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Farm</th>
                                <th>Subscription</th>
                                <th className="right">Injectors / 30d</th>
                                <th className="right">Revenue</th>
                                <th className="right">Subscription</th>
                                <th className="right">Profit / 30d</th>
                                <th className="right">Ready Now</th>
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
                                    <td className="right num">{FormatHelper.number(result.injectorsPerMonth, 1)}</td>
                                    <td className="right num">{isk(result.revenue)}</td>
                                    <td className="right num muted">−{isk(result.cost)}</td>
                                    <td className="right num" style={{color: result.profit >= 0 ? 'var(--good)' : 'var(--danger)'}}>{isk(result.profit)}</td>
                                    <td className="right num">{isk(result.readyValue)}</td>
                                </tr>
                            )}
                            <tr className="total-row">
                                <td colSpan={2}>Total</td>
                                <td className="right num">{FormatHelper.number(total('injectorsPerMonth'), 1)}</td>
                                <td className="right num">{isk(total('revenue'))}</td>
                                <td className="right num muted">−{isk(total('cost'))}</td>
                                <td className="right num" style={{color: total('profit') >= 0 ? 'var(--good)' : 'var(--danger)'}}>{isk(total('profit'))}</td>
                                <td className="right num">{isk(total('readyValue'))}</td>
                            </tr>
                        </tbody>
                    </table>
                }
            </div>
        );
    }

    render() {
        return (
            <Panel title="Profit" icon="savings" flush={true} style={{marginTop: 16}}
                   subtitle="ISK, Jita lowest sell, at each farm's current training rate">
                {this.renderBody()}
            </Panel>
        );
    }
}
