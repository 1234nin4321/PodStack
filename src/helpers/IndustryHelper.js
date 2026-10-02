'use strict';

// Industry jobs and planetary colonies, as loaded by Character.refreshIndustryJobs / refreshPlanets.

const ACTIVITIES = {
    1: 'Manufacturing',
    3: 'TE Research',
    4: 'ME Research',
    5: 'Copying',
    7: 'Reverse Engineering',
    8: 'Invention',
    9: 'Reactions',
    11: 'Reactions',
};

export default class IndustryHelper {
    static activityName(activityId) {
        return ACTIVITIES[activityId] || `Activity ${activityId}`;
    }

    // ESI keeps a job "active" until it's delivered, even after its end date.
    static isJobReady(job) {
        return job.status === 'ready' || (job.status === 'active' && new Date(job.end_date) <= new Date());
    }

    static jobProgress(job) {
        const start = new Date(job.start_date).getTime();
        const end = new Date(job.end_date).getTime();
        return end > start ? (Date.now() - start) / (end - start) : 1;
    }

    /**
     * Unfinished jobs (active, paused or ready to deliver) of the given characters, soonest first.
     *
     * @returns {array} [{job, character}]
     */
    static openJobs(characters) {
        return characters
            .flatMap(character => (character.industryJobs || [])
                .filter(job => ['active', 'paused', 'ready'].includes(job.status))
                .map(job => ({job, character})))
            .sort((a, b) => new Date(a.job.end_date) - new Date(b.job.end_date));
    }

    // nav badges
    static countReadyJobs(characters) {
        return IndustryHelper.openJobs(characters).filter(o => IndustryHelper.isJobReady(o.job)).length;
    }

    static countExpiredExtractors(characters) {
        return IndustryHelper.colonies(characters)
            .reduce((sum, o) => sum + o.colony.extractors.filter(IndustryHelper.isExtractorExpired).length, 0);
    }

    static isExtractorExpired(extractor) {
        return extractor.expiry_time !== undefined && new Date(extractor.expiry_time) <= new Date();
    }

    static extractorProgress(extractor) {
        if (extractor.install_time === undefined || extractor.expiry_time === undefined) {
            return 0;
        }
        const start = new Date(extractor.install_time).getTime();
        const end = new Date(extractor.expiry_time).getTime();
        return end > start ? (Date.now() - start) / (end - start) : 1;
    }

    // The soonest extractor expiry on a colony, or undefined if it has no running extractors.
    static colonyNextExpiry(colony) {
        const times = (colony.extractors || [])
            .filter(e => e.expiry_time !== undefined && !IndustryHelper.isExtractorExpired(e))
            .map(e => new Date(e.expiry_time).getTime());
        return times.length > 0 ? new Date(Math.min(...times)) : undefined;
    }

    /**
     * @returns {array} [{colony, character}] of the given characters
     */
    static colonies(characters) {
        return characters.flatMap(character => (character.planets || []).map(colony => ({colony, character})));
    }
}
