// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarCreatePopover } from "@/components/provider-workspace/calendar-create-popover";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

const copy = en.ProviderWorkspace.appointments;
const ada = {
  id: "ada",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
};
const prayer = { id: "prayer", name: "Prayer", defaultDurationMinutes: 17 };
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockApi(
  options: {
    failScheduleOnce?: boolean;
    failLoadOnce?: boolean;
    pending?: Promise<Response>;
  } = {},
) {
  let failSchedule = options.failScheduleOnce;
  let failLoad = options.failLoadOnce;
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const address = String(url);
    if (!init?.method) {
      if (failLoad && address.endsWith("students")) {
        failLoad = false;
        return Response.json({}, { status: 500 });
      }
      return Response.json(
        address.endsWith("students")
          ? {
              students: [
                ada,
                { id: "grace", displayName: "Grace Hopper", email: null },
              ],
            }
          : {
              activities: [
                prayer,
                { id: "lunch", name: "Lunch", defaultDurationMinutes: null },
              ],
            },
      );
    }
    const payload = JSON.parse(String(init.body));
    if (address.endsWith("/students"))
      return Response.json({
        student: {
          id: "new-student",
          displayName: payload.displayName,
          email: null,
        },
      });
    if (address.endsWith("/personal-activities"))
      return Response.json({ activity: { id: "new-activity", ...payload } });
    if (failSchedule) {
      failSchedule = false;
      return Response.json(
        { error: "This time overlaps Ada's session." },
        { status: 409 },
      );
    }
    if (options.pending) return options.pending;
    return Response.json({ saved: true });
  });
}
function open(
  options: { copy?: typeof copy; locale?: string; startsAt?: Date } = {},
) {
  const onSaved = vi.fn(),
    onClose = vi.fn(),
    onStudentCreated = vi.fn(),
    onSavingChange = vi.fn();
  render(
    <CalendarCreatePopover
      anchor={{
        startsAt: options.startsAt ?? new Date("2030-01-15T09:00:00Z"),
        x: 120,
        y: 200,
      }}
      accessToken="token"
      timeZone="Europe/Istanbul"
      locale={options.locale ?? "en"}
      sessionDuration={45}
      copy={options.copy ?? copy}
      onSaved={onSaved}
      onClose={onClose}
      onStudentCreated={onStudentCreated}
      onSavingChange={onSavingChange}
      readError={async (response) =>
        (await response.json()).error ?? copy.saveError
      }
    />,
  );
  return { onSaved, onClose, onStudentCreated, onSavingChange };
}
const mutations = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

describe("calendar creation popover", () => {
  it("focuses a searchable combobox in a non-modal popover and adds an existing student with one selection", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    const input = screen.getByRole("combobox", {
      name: copy.quickSearchStudent,
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe(
      "popover-content",
    );
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    await userEvent.click(
      await screen.findByRole("option", { name: /Ada Lovelace/ }),
    );
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(mutations(api)).toHaveLength(1);
    expect(mutations(api)[0][0]).toBe("/api/provider/appointments");
    expect(JSON.parse(String(mutations(api)[0][1]?.body))).toEqual({
      providerStudentId: "ada",
      startsAt: "2030-01-15T09:00:00.000Z",
      endsAt: "2030-01-15T09:45:00.000Z",
      recurrence: "none",
      color: "#f0d7ff",
    });
  });

  it.each(["en", "tr"] as const)(
    "creates and schedules a new student by typing a name and pressing Enter in %s",
    async (locale) => {
      const messages = (locale === "tr" ? tr : en).ProviderWorkspace
        .appointments;
      const api = mockApi();
      vi.stubGlobal("fetch", api);
      const callbacks = open({ copy: messages, locale });
      await screen.findByRole("option", { name: /Ada/ });
      const user = userEvent.setup();
      await user.type(
        screen.getByRole("combobox", { name: messages.quickSearchStudent }),
        "New Student",
      );
      await user.keyboard("{Enter}");
      await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
      expect(mutations(api).map(([url]) => url)).toEqual([
        "/api/provider/students",
        "/api/provider/appointments",
      ]);
      expect(JSON.parse(String(mutations(api)[0][1]?.body))).toEqual({
        displayName: "New Student",
      });
      expect(
        JSON.parse(String(mutations(api)[1][1]?.body)).providerStudentId,
      ).toBe("new-student");
      expect(callbacks.onStudentCreated).toHaveBeenCalledWith({
        id: "new-student",
        displayName: "New Student",
        email: null,
      });
    },
  );

  it("searches student emails and selects an existing match by keyboard without creating a duplicate", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    await screen.findByRole("option", { name: /Ada/ });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchStudent }),
      "ADA@EXAMPLE.COM",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(mutations(api)).toHaveLength(1);
    expect(
      JSON.parse(String(mutations(api)[0][1]?.body)).providerStudentId,
    ).toBe("ada");
  });

  it("uses a personal activity's duration across midnight, independently of session duration and rest", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    const callbacks = open({ startsAt: new Date("2030-01-15T20:55:00Z") });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: copy.personalActivity }),
    );
    await user.click(await screen.findByRole("option", { name: /Prayer/ }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(mutations(api).map(([url]) => url)).toEqual([
      "/api/provider/personal-activities/schedules",
    ]);
    expect(JSON.parse(String(mutations(api)[0][1]?.body))).toEqual({
      activityId: "prayer",
      startsAt: "2030-01-15T20:55:00.000Z",
      endsAt: "2030-01-15T21:12:00.000Z",
      recurrence: "none",
    });
  });

  it("creates an activity by name and supports an optional duration and weekly recurrence before Enter", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: copy.personalActivity }),
    );
    await screen.findByRole("option", { name: /Prayer/ });
    await user.click(screen.getByText(/Time & repeat/));
    fireEvent.change(
      screen.getByRole("spinbutton", { name: copy.quickDuration }),
      { target: { value: "90" } },
    );
    await user.selectOptions(screen.getByLabelText(copy.repetition), "weekly");
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchActivity }),
      "Gym",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(mutations(api).map(([url]) => url)).toEqual([
      "/api/provider/personal-activities",
      "/api/provider/personal-activities/schedules",
    ]);
    expect(JSON.parse(String(mutations(api)[0][1]?.body))).toEqual({
      name: "Gym",
      defaultDurationMinutes: 90,
    });
    expect(JSON.parse(String(mutations(api)[1][1]?.body))).toMatchObject({
      activityId: "new-activity",
      endsAt: "2030-01-15T10:30:00.000Z",
      recurrence: "weekly",
    });
  });

  it("keeps errors and the newly created name available for retry without duplicating it", async () => {
    const api = mockApi({ failScheduleOnce: true });
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    await screen.findByRole("option", { name: /Ada/ });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchStudent }),
      "New Student",
    );
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This time overlaps Ada's session.",
    );
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("combobox", {
          name: copy.quickSearchStudent,
        }) as HTMLInputElement
      ).value,
    ).toBe("New Student");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
    expect(mutations(api).map(([url]) => url)).toEqual([
      "/api/provider/students",
      "/api/provider/appointments",
      "/api/provider/appointments",
    ]);
  });

  it("blocks duplicate submissions and dismissal while the appointment is saving", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const api = mockApi({ pending });
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    const option = await screen.findByRole("option", { name: /Ada/ });
    fireEvent.click(option);
    fireEvent.click(option);
    await userEvent.keyboard("{Escape}");
    expect(mutations(api)).toHaveLength(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    await act(async () => finish(Response.json({ saved: true })));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce());
  });

  it("validates a past session before creating any student", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    open({ startsAt: new Date("2020-01-15T09:00:00Z") });
    await screen.findByRole("option", { name: /Ada/ });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchStudent }),
      "New Student",
    );
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      copy.pastSessionError,
    );
    expect(mutations(api)).toHaveLength(0);
  });

  it("offers retry when names cannot be loaded and does not create duplicates from incomplete results", async () => {
    const api = mockApi({ failLoadOnce: true });
    vi.stubGlobal("fetch", api);
    open();
    await screen.findByText(copy.quickLoadError);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchStudent }),
      "Ada Lovelace",
    );
    await user.keyboard("{Enter}");
    expect(mutations(api)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: copy.quickRetry }));
    await screen.findByRole("option", { name: /Ada/ });
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("dismisses on Escape without creating anything", async () => {
    const api = mockApi();
    vi.stubGlobal("fetch", api);
    const callbacks = open();
    await screen.findByRole("option", { name: /Ada/ });
    await userEvent.keyboard("{Escape}");
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(mutations(api)).toHaveLength(0);
  });
});
