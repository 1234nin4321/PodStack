'use strict';

import React from 'react';
import log from 'electron-log';

import FontIcon from 'material-ui/FontIcon';
import IconButton from 'material-ui/IconButton';

import Panel from '../../ui/Panel';

import FormatHelper from '../../../helpers/FormatHelper';
import MarketHelper from '../../../helpers/MarketHelper';
import TrainingProfileHelper from '../../../helpers/TrainingProfileHelper';

const isk = value => (value === undefined || value === null ? '—' : `${FormatHelper.number(value)} ISK`);

// ISK cost of the skillbooks a queue needs that the character hasn't injected yet.
export default class SkillbookPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            books: [],
            forge: {},
            averages: {},
            loading: false,
            error: undefined,
        };
    }

    componentDidMount() {
        this.load();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.queue !== this.props.queue) {
            this.load();
        }
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    async load() {
        const books = TrainingProfileHelper.getMissingSkillbooks(this.props.characterId, this.props.queue);
        const request = this.request = {};
        this.setState({books, loading: books.length > 0, error: undefined});

        if (books.length === 0) {
            return;
        }

        try {
            const ids = books.map(b => b.id);
            const [forge, averages] = await Promise.all([MarketHelper.getForgeLowestSell(ids), MarketHelper.getAveragePrices()]);

            // ignore results for a queue that has since changed
            if (!this.unmounted && request === this.request) {
                this.setState({forge, averages, loading: false});
            }
        } catch (err) {
            log.error('[Market] Failed to load skillbook prices', err);
            if (!this.unmounted && request === this.request) {
                this.setState({loading: false, error: 'Couldn\'t load market prices. Try again in a moment.'});
            }
        }
    }

    render() {
        const {books, forge, averages, loading, error} = this.state;
        const sum = prices => books.reduce((total, b) => total + (prices[b.id] || 0), 0);
        const unpriced = books.filter(b => forge[b.id] === null || forge[b.id] === undefined).length;

        return (
            <Panel
                title="Skillbooks"
                icon="menu_book"
                className="analysis-panel"
                subtitle={this.props.label}
                actions={
                    <IconButton tooltip="Close" onClick={this.props.onClose} style={{width: 32, height: 32, padding: 4}}>
                        <FontIcon className="material-icons" color="var(--text-dim)">close</FontIcon>
                    </IconButton>
                }
            >
                {books.length === 0 ?
                    <p className="empty" style={{margin: 0}}>Every skill in this plan is already injected. Nothing to buy.</p> :
                    <div>
                        <div className="analysis-totals">
                            <div>
                                <div className="analysis-total-label">Jita (The Forge) lowest sell</div>
                                <div className="analysis-total num">{loading ? '…' : isk(sum(forge))}</div>
                            </div>
                            <div>
                                <div className="analysis-total-label">EVE average price</div>
                                <div className="analysis-total num muted">{loading ? '…' : isk(sum(averages))}</div>
                            </div>
                            <div>
                                <div className="analysis-total-label">Books to buy</div>
                                <div className="analysis-total num">{books.length}</div>
                            </div>
                        </div>

                        {error && <p className="fit-error">{error}</p>}
                        {!loading && unpriced > 0 &&
                            <p className="fit-warning">
                                {unpriced} book{unpriced === 1 ? ' has' : 's have'} no sell orders in The Forge right now
                                and {unpriced === 1 ? 'is' : 'are'} left out of the Jita total.
                            </p>
                        }

                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Skillbook</th>
                                    <th className="right">Jita lowest sell</th>
                                    <th className="right">EVE average</th>
                                </tr>
                            </thead>
                            <tbody>
                                {books.map(b =>
                                    <tr key={b.id}>
                                        <td>{b.name}</td>
                                        <td className="right num">{loading ? '…' : isk(forge[b.id])}</td>
                                        <td className="right num muted">{loading ? '…' : isk(averages[b.id])}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <p className="muted analysis-note">
                            Skills already injected aren't counted. Prices refresh every 6 hours.
                        </p>
                    </div>
                }
            </Panel>
        );
    }
}
