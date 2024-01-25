import type { PlasmoMessaging } from '@plasmohq/messaging';

import type { BaseRequest } from '~types/request';
import type { BaseResponse } from '~types/response';
import { removeDynamicRules, setDynamicRules } from '~utils/declarativeNetRequest';
import { makeFullUrl } from '~utils/fetcher';
import { assertDomainWhitelist } from '~utils/storage';

const MAKE_REQUEST_DYNAMIC_RULE = 23498;

export interface Request extends BaseRequest {
  baseUrl?: string;
  headers?: Record<string, string>;
  method?: string;
  query?: Record<string, string>;
  readHeaders?: Record<string, string>;
  url: string;
  body?: any;
  bodyType: 'string' | 'FormData' | 'URLSearchParams' | 'object';
}

type Response<T> = BaseResponse<{
  response: {
    statusCode: number;
    headers: Record<string, string>;
    finalUrl: string;
    body: T;
  };
}>;

const mapBodyToFetchBody = (body: Request['body'], bodyType: Request['bodyType']): BodyInit => {
  if (bodyType === 'FormData') {
    const formData = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      formData.append(key, value.toString());
    });
    return formData;
  }
  if (bodyType === 'URLSearchParams') {
    const searchParams = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      searchParams.set(key, value.toString());
    });
    return searchParams;
  }
  if (bodyType === 'object') {
    return JSON.stringify(body);
  }
  if (bodyType === 'string') {
    return body;
  }
  return undefined;
};

const handler: PlasmoMessaging.MessageHandler<Request, Response<any>> = async (req, res) => {
  try {
    await assertDomainWhitelist(req.sender.tab.url);

    if (req.body.headers['User-Agent']) {
      await setDynamicRules({
        ruleId: MAKE_REQUEST_DYNAMIC_RULE,
        targetDomains: [new URL(req.body.url).hostname],
        requestHeaders: {
          'User-Agent': req.body.headers['User-Agent'],
        },
      });
    }

    const response = await fetch(makeFullUrl(req.body.url, req.body), {
      method: req.body.method,
      headers: req.body.headers,
      body: mapBodyToFetchBody(req.body.body, req.body.bodyType),
    });
    await removeDynamicRules([MAKE_REQUEST_DYNAMIC_RULE]);
    const contentType = response.headers.get('content-type');
    const body = contentType?.includes('application/json') ? await response.json() : await response.text();

    res.send({
      success: true,
      response: {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()), // Headers object isn't serializable
        body,
        finalUrl: response.url,
      },
    });
  } catch (err) {
    res.send({
      success: false,
      error: err.message,
    });
  }
};

export default handler;
