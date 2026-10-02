'use strict';

import React from 'react';
import log from 'electron-log';

import FormatHelper from '../../../helpers/FormatHelper';
import MarketHelper from '../../../helpers/MarketHelper';
import TrainingProfileHelper from '../../../helpers/TrainingProfileHelper';

const isk = value => (value === undefined || value === null ? '—' : `${FormatHelper.number(value)} ISK`);
const shortIsk = value => `${FormatHelper.compact(value)} ISK`;

// Strip at the top of a plan with the ISK cost of the skillbooks it needs that the character hasn't injected yet,
// expandable to a per-book list.
export default class SkillbookPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            books: [],
            forge: {},
            averages: {},
            loading: false,
            error: undefined,
            expanded: false,
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
                this.setState({loading: false, error: 'Couldn\'t load market prices.'});
            }
        }
    }

    renderTable() {
        const {books, forge, averages, loading} = this.state;

        return (
            <div className="skillbook-details">
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
                    Skills already injected aren't counted. Jita is the lowest sell order in The Forge; prices refresh
                    every 6 hours.
                </p>
            </div>
        );
    }

    render() {
        const {books, forge, averages, loading, error, expanded} = this.state;
        const hasSkills = this.props.queue.some(item => item.type === 'skill');

        if (!hasSkills) {
            return null;
        }

        if (books.length === 0) {
            return (
                <div className="skillbook-strip done">
                    <i className="material-icons">menu_book</i>
                    <span>Skillbooks: every skill in this plan is already injected.</span>
                </div>
            );
        }

        const sum = prices => books.reduce((total, b) => total + (prices[b.id] || 0), 0);
        const unpriced = books.filter(b => forge[b.id] === null || forge[b.id] === undefined).length;

        return (
            <div className="skillbook">
                <div className="skillbook-strip">
                    <i className="material-icons">menu_book</i>
                    <span className="skillbook-summary">
                        <strong>{books.length} skillbook{books.length === 1 ? '' : 's'} to buy</strong>
                        {loading ? <span className="muted"> · loading prices…</span> :
                            error ? <span className="fit-warning"> · {error}</span> :
                                <span>
                                    {' · Jita '}<span className="num skillbook-total">{shortIsk(sum(forge))}</span>
                                    <span className="muted">{' · EVE avg '}<span className="num">{shortIsk(sum(averages))}</span></span>
                                    {unpriced > 0 &&
                                        <span className="fit-warning" title="No sell orders in The Forge right now; left out of the Jita total">
                                            {' · '}{unpriced} not on market
                                        </span>
                                    }
                                </span>
                        }
                    </span>
                    <button type="button" className="text-button" onClick={() => this.setState({expanded: !expanded})}>
                        {expanded ? 'Hide books' : 'Show books'}
                        <i className="material-icons">{expanded ? 'expand_less' : 'expand_more'}</i>
                    </button>
                </div>
                {expanded && this.renderTable()}
            </div>
        );
    }
}
