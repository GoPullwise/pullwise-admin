import axios from "axios";
import { env } from "../config/env.js";

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = typeof payload?.code === "string" ? payload.code : "";
  }
}

export const http = axios.create({
  baseURL: env.VITE_API_BASE_URL || "",
  withCredentials: true,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
  },
});

export async function request(path, options = {}) {
  try {
    const response = await http.request({
      url: path,
      method: options.method || "GET",
      data: options.body,
      params: options.params,
      headers: options.headers,
      signal: options.signal,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ApiError(error.response?.data?.message || error.message, {
        status: error.response?.status,
        payload: error.response?.data,
      });
    }
    throw error;
  }
}
