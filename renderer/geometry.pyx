def compact_points(list points, double tolerance=0.000001):
    cdef list compact = []
    cdef object point
    cdef double x
    cdef double y
    cdef double previous_x = 0
    cdef double previous_y = 0
    cdef bint has_previous = False

    for point in points:
        x = float(point[0])
        y = float(point[1])
        if has_previous and abs(x - previous_x) <= tolerance and abs(
            y - previous_y
        ) <= tolerance:
            continue

        compact.append([x, y])
        previous_x = x
        previous_y = y
        has_previous = True

    return compact
