import React from 'react';
import PropTypes from 'prop-types';
import countBy from 'lodash/countBy';
import moment from 'moment';
import { Button } from 'reactstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationCircle } from '@fortawesome/free-solid-svg-icons';

import { alertStatusMap, endpoints } from '../constants';
import { getJobsUrl, createQueryParams, getApiUrl } from '../../helpers/url';
import { create } from '../../helpers/http';
import RepositoryModel from '../../models/repository';
import { displayNumber, getStatus } from '../helpers';

const GraphTooltip = ({ selectedDataPoint, testData, user, updateData }) => {
  // we either have partial information provided by the selected
  // query parameter or the full selectedDataPoint object provided from the
  // graph library

  const datum = selectedDataPoint.datum
    ? selectedDataPoint.datum
    : selectedDataPoint;

  const testDetails = testData.find(
    item => item.signatureId === datum.signatureId,
  );

  const flotIndex = testDetails.data.findIndex(
    item => item.pushId === datum.pushId,
  );
  const dataPointDetails = testDetails.data[flotIndex];

  const retriggers = countBy(testDetails.resultSetData, resultSetId =>
    resultSetId === selectedDataPoint.pushId ? 'retrigger' : 'original',
  );
  const retriggerNum = retriggers.retrigger - 1;

  const prevFlotDataPointIndex = flotIndex - 1;

  const value = dataPointDetails.y;
  //     value: Math.round(v * 1000) / 1000,
  const v0 =
    prevFlotDataPointIndex >= 0
      ? testDetails.data[prevFlotDataPointIndex].y
      : value;
  const deltaValue = value - v0;
  const deltaPercent = value / v0 - 1;
  let alert;
  let alertStatus;

  if (dataPointDetails.alertSummary && dataPointDetails.alertSummary.alerts) {
    alert = dataPointDetails.alertSummary.alerts.find(
      alert => alert.series_signature.id === testDetails.signatureId,
    );
  }

  if (alert) {
    alertStatus =
      alert.status === alertStatusMap.acknowledged
        ? getStatus(testDetails.alertSummary.status)
        : getStatus(alert.status, alertStatusMap);
  }

  const prevRevision = testDetails.data[prevFlotDataPointIndex].revision;
  const prevPushId = testDetails.data[prevFlotDataPointIndex].pushId;
  const repoModel = new RepositoryModel(testDetails.project);
  const jobsUrl = `${getJobsUrl({
    repo: testDetails.project,
    revision: dataPointDetails.revision,
  })}${createQueryParams({
    selectedJob: dataPointDetails.jobId,
    group_state: 'expanded',
  })}`;

  // TODO this is broken
  const pushLogUrl = repoModel.getPushLogRangeHref({
    fromchange: prevRevision,
    tochange: dataPointDetails.revision,
  });

  // TODO refactor create to use getData wrapper
  const createAlert = () =>
    create(getApiUrl(endpoints.alertSummary), {
      repository_id: testDetails.projectId,
      framework_id: testDetails.frameworkId,
      push_id: dataPointDetails.pushId,
      prev_push_id: prevPushId,
    })
      .then(response => response.json())
      .then(response => {
        const newAlertSummaryId = response.alert_summary_id;
        return create(getApiUrl('/performance/alert/'), {
          summary_id: newAlertSummaryId,
          signature_id: testDetails.signatureId,
        }).then(() =>
          updateData(
            testDetails.signatureId,
            testDetails.projectId,
            newAlertSummaryId,
            flotIndex,
          ),
        );
      });

  return (
    <div className="body">
      <div>
        <p>({testDetails.project})</p>
        <p className="small">{testDetails.platform}</p>
      </div>
      <div>
        <p>
          {displayNumber(value)}
          <span className="text-muted">
            {testDetails.lowerIsBetter
              ? ' (lower is better)'
              : ' (higher is better)'}
          </span>
        </p>
        <p className="small">
          &Delta; {displayNumber(deltaValue.toFixed(1))} (
          {(100 * deltaPercent).toFixed(1)}%)
        </p>
      </div>

      <div>
        {prevRevision && (
          <span>
            <a href={pushLogUrl} target="_blank" rel="noopener noreferrer">
              {dataPointDetails.revision.slice(0, 13)}
            </a>
            {dataPointDetails.jobId && (
              <a href={jobsUrl} target="_blank" rel="noopener noreferrer">
                {' '}
                (job
              </a>
            )}
            ,{' '}
            <a
              href={`#/comparesubtest${createQueryParams({
                originalProject: testDetails.project,
                newProject: testDetails.project,
                originalRevision: prevRevision,
                newRevision: dataPointDetails.revision,
                originalSignature: testDetails.signatureId,
                newSignature: testDetails.signatureId,
                framework: testDetails.frameworkId,
              })}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              compare
            </a>
            )
          </span>
        )}
        {dataPointDetails.alertSummary ? (
          <p>
            <a
              href={`perf.html#/alerts?id=${dataPointDetails.alertSummary.id}`}
            >
              <FontAwesomeIcon
                className="text-warning"
                icon={faExclamationCircle}
                size="sm"
              />
              {` Alert # ${dataPointDetails.alertSummary.id}`}
            </a>
            <span className="text-muted">
              {` - ${alertStatus} `}
              {alert.related_summary_id && (
                <span>
                  {alert.related_summary_id !== dataPointDetails.alertSummary.id
                    ? 'to'
                    : 'from'}
                  <a
                    href={`#/alerts?id=${alert.related_summary_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{` alert # ${alert.related_summary_id}`}</a>
                </span>
              )}
            </span>
          </p>
        ) : (
          <p className="pt-2">
            {user.isStaff ? (
              <Button color="info" outline size="sm" onClick={createAlert}>
                create alert
              </Button>
            ) : (
              <span>(log in as a a sheriff to create)</span>
            )}
          </p>
        )}
        <p className="small text-white pt-2">{`${moment
          .utc(dataPointDetails.x)
          .format('MMM DD hh:mm:ss')} UTC`}</p>
        {Boolean(retriggerNum) && (
          <p className="small">{`Retriggers: ${retriggerNum}`}</p>
        )}
      </div>
    </div>
  );
};

GraphTooltip.propTypes = {
  selectedDataPoint: PropTypes.shape({}).isRequired,
  testData: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  user: PropTypes.shape({}).isRequired,
  updateData: PropTypes.func.isRequired,
};

export default GraphTooltip;
