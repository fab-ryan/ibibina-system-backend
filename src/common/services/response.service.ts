import { Injectable, Scope, Inject, HttpStatus } from '@nestjs/common';
import { ResponseDto } from '../dto/response.dto';
import { REQUEST } from '@nestjs/core';
import express from 'express';
import { PartialType } from '@nestjs/swagger';

export class IResponseData<T> {
  success = true;
  statusCode: number = HttpStatus.OK;
  data: T | null = null;
  path: any;
  message?: string;
  method?: string;
  requestId?: string;
  timestamp: number = Date.now();
  key?: string = 'data';
}

export class IRequest extends PartialType(IResponseData) {}

@Injectable({ scope: Scope.REQUEST | Scope.TRANSIENT | Scope.DEFAULT })
export class ResponseService {
  constructor(@Inject(REQUEST) private readonly request: express.Request) {}
  public response(result: IRequest): ResponseDto {
    const { route, method } = this.request;
    const requestId = this.request.headers['x-request-id'] as string;
    const response: ResponseDto = {
      success: result.success ?? true,
      statusCode: result.statusCode || HttpStatus.OK,
      [result.key ?? 'data']: result.data,
      path: route.path,
      method: method,
      message: result.message || 'Operation successful',
      requestId: requestId,
      timestamp: new Date(Date.now()).toISOString(),
    };
    return response;
  }
}
