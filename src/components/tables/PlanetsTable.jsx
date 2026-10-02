'use strict';

import React from 'react';

import DateTimeHelper from '../../helpers/DateTimeHelper';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';
import IndustryHelper from '../../helpers/IndustryHelper';
import Bar from '../ui/Bar';

// Planetary colonies of one or more characters: each with its extractors (and when they stop) and stored goods.
// Colonies needing attention (expired extractors) come first, then by soonest expiry.
export default class PlanetsTable extends React.Component {
    componentDidMount() {
        this.timer = setInterval(() => this.forceUpdate(), 10000);
    }

    componentWillUnmount() {
        clearInterval(this.timer);
    }

    render() {
        const colonies = IndustryHelper.colonies(this.props.characters).sort((a, b) => {
            const expired = o => o.colony.extractors.some(IndustryHelper.isExtractorExpired) ? 0 : 1;
            const next = o => (IndustryHelper.colonyNextExpiry(o.colony) || new Date(8.64e15)).getTime();
            return (expired(a) - expired(b)) || (next(a) - next(b));
        });

        if (colonies.length === 0) {
            return <p className="empty" style={{margin: 0, padding: 16}}>No planetary colonies.</p>;
        }

        return (
            <table className="data-table pi-table">
                <thead>
                    <tr>
                        {this.props.showCharacter && <th>Character</th>}
                        <th>Planet</th>
                        <th>Extractors</th>
                        <th>Stored</th>
                        <th className="right">Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {colonies.map(({colony, character}) =>
                        <tr key={`${character.id}-${colony.planet_id}`}>
                            {this.props.showCharacter && <td>{character.name}</td>}
                            <td>
                                <div>{colony.planet_name}</div>
                                <div className="muted pi-sub">
                                    <span style={{textTransform: 'capitalize'}}>{colony.planet_type}</span>
                                    {' · '}CC level {colony.upgrade_level} · {colony.num_pins} structures
                                    {colony.factories > 0 && ` · ${colony.factories} factories`}
                                </div>
                            </td>
                            <td>
                                {colony.extractors.length === 0 && <span className="muted">None</span>}
                                {colony.extractors.map(extractor => {
                                    const expired = IndustryHelper.isExtractorExpired(extractor);

                                    return (
                                        <div key={extractor.pin_id} className="pi-extractor">
                                            <div className="pi-extractor-head">
                                                <span>{extractor.product_name || 'Not set up'}</span>
                                                {extractor.expiry_time === undefined ? <span className="badge warn">Idle</span> :
                                                    expired ? <span className="badge danger">Expired</span> :
                                                        <span className="num muted">{DateTimeHelper.timeUntil(new Date(extractor.expiry_time))}</span>}
                                            </div>
                                            <Bar value={IndustryHelper.extractorProgress(extractor)} variant={expired ? 'omega' : ''}/>
                                        </div>
                                    );
                                })}
                            </td>
                            <td>
                                {colony.storage.length === 0 && <span className="muted">Empty</span>}
                                {colony.storage.slice().sort((a, b) => b.amount - a.amount).slice(0, 4).map(item =>
                                    <div key={item.type_id} className="type-cell pi-stored">
                                        <img src={ImageHelper.typeIcon(item.type_id, 32)} alt=""/>
                                        <span>{item.name || `Type #${item.type_id}`} <span className="num muted">×{FormatHelper.number(item.amount)}</span></span>
                                    </div>
                                )}
                                {colony.storage.length > 4 && <div className="muted pi-sub">+{colony.storage.length - 4} more</div>}
                            </td>
                            <td className="right muted num">{DateTimeHelper.timeSince(new Date(colony.last_update))} ago</td>
                        </tr>
                    )}
                </tbody>
            </table>
        );
    }
}
