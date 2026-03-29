#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Fitsi AI — Progressive Stress Test Runner
# ═══════════════════════════════════════════════════════════════════════════
#
# Executes Locust in headless mode with 6 escalation phases,
# from 100 users (warmup) up to 200,000 users (breaking point).
#
# Usage:
#   cd backend/
#   bash scripts/run_stress_test.sh                        # default: localhost:8000
#   bash scripts/run_stress_test.sh http://staging.fitsi.app  # custom host
#
# Prerequisites:
#   pip install locust
#   python -m scripts.seed_users --count 1000
#   Backend server must be running
#
# Output:
#   results/stress_test_YYYYMMDD_HHMMSS/
#     phase_1_warmup/          (Locust CSV results)
#     phase_2_baseline/
#     ...
#     phase_6_breaking_point/
#     full_report.json         (consolidated metrics)
#     full_report.txt          (human-readable report)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HOST="${1:-http://localhost:8000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCUST_FILE="${SCRIPT_DIR}/stress_test.py"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RESULTS_DIR="${SCRIPT_DIR}/../results/stress_test_${TIMESTAMP}"

# Phase definitions: name, users, spawn_rate, duration
declare -a PHASE_NAMES=("warmup" "baseline" "medium_load" "high_load" "stress" "breaking_point")
declare -a PHASE_USERS=(100 1000 10000 50000 100000 200000)
declare -a PHASE_SPAWN_RATES=(10 50 500 2500 5000 10000)
declare -a PHASE_DURATIONS=("2m" "3m" "3m" "3m" "3m" "5m")

TOTAL_PHASES=${#PHASE_NAMES[@]}

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║          FITSI AI — PROGRESSIVE STRESS TEST                    ║"
    echo "║          Enterprise Load Testing Suite (Locust)                ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  Host:       ${HOST}"
    echo "║  Phases:     ${TOTAL_PHASES} (100 → 200,000 users)"
    echo "║  Results:    ${RESULTS_DIR}"
    echo "║  Started:    $(date '+%Y-%m-%d %H:%M:%S')"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    echo -e "${BLUE}[PRE-CHECK]${NC} Verifying prerequisites..."

    # Check locust is installed
    if ! command -v locust &>/dev/null; then
        echo -e "${RED}ERROR:${NC} locust is not installed. Run: pip install locust"
        exit 1
    fi

    # Check locust file exists
    if [[ ! -f "${LOCUST_FILE}" ]]; then
        echo -e "${RED}ERROR:${NC} Locust file not found: ${LOCUST_FILE}"
        exit 1
    fi

    # Check server is reachable
    echo -e "${BLUE}[PRE-CHECK]${NC} Checking server health at ${HOST}..."
    local health_response
    health_response=$(curl -s -o /dev/null -w "%{http_code}" "${HOST}/health" 2>/dev/null || echo "000")

    if [[ "${health_response}" == "000" ]]; then
        echo -e "${RED}ERROR:${NC} Cannot reach server at ${HOST}"
        echo "Make sure the backend is running: uvicorn app.main:app --host 0.0.0.0 --port 8000"
        exit 1
    elif [[ "${health_response}" == "503" ]]; then
        echo -e "${YELLOW}WARNING:${NC} Server is degraded (503). Proceeding anyway..."
    else
        echo -e "${GREEN}OK:${NC} Server health check passed (${health_response})"
    fi

    # Create results directory
    mkdir -p "${RESULTS_DIR}"
    echo -e "${GREEN}OK:${NC} Results directory created"
    echo ""
}

run_phase() {
    local phase_num=$1
    local phase_idx=$((phase_num - 1))
    local name="${PHASE_NAMES[$phase_idx]}"
    local users="${PHASE_USERS[$phase_idx]}"
    local spawn_rate="${PHASE_SPAWN_RATES[$phase_idx]}"
    local duration="${PHASE_DURATIONS[$phase_idx]}"
    local phase_dir="${RESULTS_DIR}/phase_${phase_num}_${name}"

    mkdir -p "${phase_dir}"

    echo -e "${BOLD}${CYAN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  PHASE ${phase_num}/${TOTAL_PHASES}: ${name^^}"
    echo "  Users: ${users} | Spawn rate: ${spawn_rate}/s | Duration: ${duration}"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"

    local start_time
    start_time=$(date +%s)

    # Run Locust in headless mode
    locust \
        -f "${LOCUST_FILE}" \
        --host "${HOST}" \
        --headless \
        -u "${users}" \
        -r "${spawn_rate}" \
        --run-time "${duration}" \
        --csv "${phase_dir}/results" \
        --csv-full-history \
        --html "${phase_dir}/report.html" \
        --logfile "${phase_dir}/locust.log" \
        --loglevel INFO \
        --exit-code-on-error 0 \
        2>&1 | tee "${phase_dir}/console.log"

    local exit_code=$?
    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # Parse results from CSV
    local stats_file="${phase_dir}/results_stats.csv"
    local survived="true"

    if [[ ${exit_code} -ne 0 ]]; then
        survived="false"
        echo -e "${RED}  PHASE ${phase_num} FAILED (exit code: ${exit_code})${NC}"
    fi

    # Extract key metrics from the Aggregated row in stats CSV
    local total_reqs=0
    local total_fails=0
    local avg_ms=0
    local p50_ms=0
    local p95_ms=0
    local p99_ms=0
    local rps=0

    if [[ -f "${stats_file}" ]]; then
        # The last row in the CSV is "Aggregated"
        local agg_line
        agg_line=$(tail -1 "${stats_file}" 2>/dev/null || echo "")

        if [[ -n "${agg_line}" ]]; then
            # CSV columns (Locust 2.x):
            # Type,Name,Request Count,Failure Count,Median Response Time,
            # Average Response Time,Min Response Time,Max Response Time,
            # Average Content Size,Requests/s,Failures/s,
            # 50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%
            total_reqs=$(echo "${agg_line}" | awk -F',' '{print $3}' 2>/dev/null || echo "0")
            total_fails=$(echo "${agg_line}" | awk -F',' '{print $4}' 2>/dev/null || echo "0")
            avg_ms=$(echo "${agg_line}" | awk -F',' '{print $6}' 2>/dev/null || echo "0")
            rps=$(echo "${agg_line}" | awk -F',' '{print $10}' 2>/dev/null || echo "0")
            p50_ms=$(echo "${agg_line}" | awk -F',' '{print $12}' 2>/dev/null || echo "0")
            p95_ms=$(echo "${agg_line}" | awk -F',' '{print $17}' 2>/dev/null || echo "0")
            p99_ms=$(echo "${agg_line}" | awk -F',' '{print $19}' 2>/dev/null || echo "0")
        fi
    fi

    local error_rate=0
    if [[ "${total_reqs}" -gt 0 ]] 2>/dev/null; then
        error_rate=$(echo "scale=2; ${total_fails} * 100 / ${total_reqs}" | bc 2>/dev/null || echo "0")
    fi

    # Print phase summary
    echo ""
    echo -e "${BOLD}  Phase ${phase_num} Summary:${NC}"
    echo -e "    Requests:     ${total_reqs}"
    echo -e "    Failures:     ${total_fails} (${error_rate}%)"
    echo -e "    RPS:          ${rps}"
    echo -e "    Latency p50:  ${p50_ms}ms"
    echo -e "    Latency p95:  ${p95_ms}ms"
    echo -e "    Latency p99:  ${p99_ms}ms"
    echo -e "    Avg latency:  ${avg_ms}ms"
    echo -e "    Duration:     ${elapsed}s"
    echo -e "    Survived:     ${survived}"
    echo ""

    # Write phase JSON for the capacity report analyzer
    cat > "${phase_dir}/metrics.json" <<METRICSEOF
{
    "phase": ${phase_num},
    "name": "${name}",
    "target_users": ${users},
    "spawn_rate": ${spawn_rate},
    "duration": "${duration}",
    "actual_duration_s": ${elapsed},
    "total_requests": ${total_reqs},
    "total_failures": ${total_fails},
    "error_rate_pct": ${error_rate},
    "rps": ${rps},
    "avg_latency_ms": ${avg_ms},
    "p50_latency_ms": ${p50_ms},
    "p95_latency_ms": ${p95_ms},
    "p99_latency_ms": ${p99_ms},
    "survived": ${survived},
    "exit_code": ${exit_code}
}
METRICSEOF

    # Cooldown between phases
    if [[ ${phase_num} -lt ${TOTAL_PHASES} ]]; then
        echo -e "${YELLOW}  Cooldown: 10 seconds before next phase...${NC}"
        sleep 10
    fi

    return ${exit_code}
}

generate_final_report() {
    echo -e "${BOLD}${CYAN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  GENERATING FINAL REPORT"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"

    # Consolidate all phase metrics into a single JSON
    local report_json="${RESULTS_DIR}/full_report.json"
    local report_txt="${RESULTS_DIR}/full_report.txt"

    echo "{" > "${report_json}"
    echo "  \"test_id\": \"stress_test_${TIMESTAMP}\"," >> "${report_json}"
    echo "  \"host\": \"${HOST}\"," >> "${report_json}"
    echo "  \"started_at\": \"$(date -r "$(stat -f %m "${RESULTS_DIR}" 2>/dev/null || date +%s)" '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')\"," >> "${report_json}"
    echo "  \"completed_at\": \"$(date '+%Y-%m-%dT%H:%M:%S')\"," >> "${report_json}"
    echo "  \"phases\": [" >> "${report_json}"

    local first=true
    for phase_num in $(seq 1 ${TOTAL_PHASES}); do
        local phase_idx=$((phase_num - 1))
        local name="${PHASE_NAMES[$phase_idx]}"
        local metrics_file="${RESULTS_DIR}/phase_${phase_num}_${name}/metrics.json"

        if [[ -f "${metrics_file}" ]]; then
            if [[ "${first}" == "true" ]]; then
                first=false
            else
                echo "    ," >> "${report_json}"
            fi
            echo -n "    " >> "${report_json}"
            cat "${metrics_file}" >> "${report_json}"
        fi
    done

    echo "" >> "${report_json}"
    echo "  ]" >> "${report_json}"
    echo "}" >> "${report_json}"

    # Generate text report
    {
        echo "╔══════════════════════════════════════════════════════════════════╗"
        echo "║          FITSI AI — STRESS TEST FINAL REPORT                   ║"
        echo "╠══════════════════════════════════════════════════════════════════╣"
        echo "║  Test ID:    stress_test_${TIMESTAMP}"
        echo "║  Host:       ${HOST}"
        echo "║  Completed:  $(date '+%Y-%m-%d %H:%M:%S')"
        echo "╠══════════════════════════════════════════════════════════════════╣"
        echo ""
        printf "%-6s %-16s %8s %8s %8s %8s %8s %8s %10s\n" \
            "Phase" "Name" "Users" "RPS" "p50(ms)" "p95(ms)" "p99(ms)" "Errors%" "Survived"
        echo "──────────────────────────────────────────────────────────────────────────────────"

        for phase_num in $(seq 1 ${TOTAL_PHASES}); do
            local phase_idx=$((phase_num - 1))
            local name="${PHASE_NAMES[$phase_idx]}"
            local users="${PHASE_USERS[$phase_idx]}"
            local metrics_file="${RESULTS_DIR}/phase_${phase_num}_${name}/metrics.json"

            if [[ -f "${metrics_file}" ]]; then
                local rps avg p50 p95 p99 err survived
                rps=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print(d.get('rps',0))" 2>/dev/null || echo "0")
                p50=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print(d.get('p50_latency_ms',0))" 2>/dev/null || echo "0")
                p95=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print(d.get('p95_latency_ms',0))" 2>/dev/null || echo "0")
                p99=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print(d.get('p99_latency_ms',0))" 2>/dev/null || echo "0")
                err=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print(d.get('error_rate_pct',0))" 2>/dev/null || echo "0")
                survived=$(python3 -c "import json; d=json.load(open('${metrics_file}')); print('YES' if d.get('survived',False) else 'NO')" 2>/dev/null || echo "?")

                printf "%-6s %-16s %8s %8s %8s %8s %8s %8s %10s\n" \
                    "${phase_num}" "${name}" "${users}" "${rps}" "${p50}" "${p95}" "${p99}" "${err}%" "${survived}"
            else
                printf "%-6s %-16s %8s %8s\n" "${phase_num}" "${name}" "${users}" "SKIPPED"
            fi
        done

        echo ""
        echo "══════════════════════════════════════════════════════════════════"
        echo "  Results saved to: ${RESULTS_DIR}/"
        echo "  Run capacity analysis: python scripts/capacity_report.py ${RESULTS_DIR}/full_report.json"
        echo "══════════════════════════════════════════════════════════════════"
    } > "${report_txt}"

    # Print the text report to console
    cat "${report_txt}"

    echo ""
    echo -e "${GREEN}Reports generated:${NC}"
    echo "  JSON: ${report_json}"
    echo "  Text: ${report_txt}"
    echo "  HTML: ${RESULTS_DIR}/phase_*/report.html"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    print_banner
    check_prerequisites

    local failed_at=0

    for phase_num in $(seq 1 ${TOTAL_PHASES}); do
        if ! run_phase "${phase_num}"; then
            echo -e "${YELLOW}WARNING:${NC} Phase ${phase_num} had issues, but continuing..."
        fi

        # Check if the server is still alive after each phase
        local health_code
        health_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${HOST}/health" 2>/dev/null || echo "000")

        if [[ "${health_code}" == "000" ]]; then
            echo -e "${RED}SERVER DOWN:${NC} Server is unreachable after phase ${phase_num}"
            echo "Breaking point reached at ${PHASE_USERS[$((phase_num - 1))]} users"
            failed_at=${phase_num}
            break
        fi
    done

    generate_final_report

    if [[ ${failed_at} -gt 0 ]]; then
        local fail_idx=$((failed_at - 1))
        echo ""
        echo -e "${RED}BREAKING POINT: Server went down at phase ${failed_at} (${PHASE_USERS[$fail_idx]} users)${NC}"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}All phases completed successfully!${NC}"
}

main "$@"
